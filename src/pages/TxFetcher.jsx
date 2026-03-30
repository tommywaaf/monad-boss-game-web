import { useState, useRef, useCallback, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { trackUsage } from '../utils/counter'
import './TxFetcher.css'

const ETHERSCAN_API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY || ''
const HAS_API_KEY = ETHERSCAN_API_KEY.length > 0

// Etherscan V2 multichain API — single key works across all supported chains
const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api'
const CHAINLIST_URL = 'https://api.etherscan.io/v2/chainlist'
const DELAY_MS = HAS_API_KEY ? 250 : 5500

function parseChainlist(data) {
  if (!data?.result?.length) return []
  return data.result
    .filter(c => c.status === 1 && !c.chainname.toLowerCase().includes('testnet') && !c.chainname.toLowerCase().includes('hoodi') && !c.chainname.toLowerCase().includes('bokuto') && !c.chainname.toLowerCase().includes('bepolia'))
    .map(c => ({
      id: c.chainid,
      name: c.chainname,
      chainId: parseInt(c.chainid, 10),
      explorer: c.blockexplorer.endsWith('/') ? c.blockexplorer + 'tx/' : c.blockexplorer + '/tx/',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

const FALLBACK_NETWORKS = [
  { id: '1',     name: 'Ethereum Mainnet',     chainId: 1,     explorer: 'https://etherscan.io/tx/' },
  { id: '999',   name: 'HyperEVM Mainnet',     chainId: 999,   explorer: 'https://hyperevmscan.io/tx/' },
  { id: '8453',  name: 'Base Mainnet',         chainId: 8453,  explorer: 'https://basescan.org/tx/' },
  { id: '42161', name: 'Arbitrum One Mainnet',  chainId: 42161, explorer: 'https://arbiscan.io/tx/' },
  { id: '137',   name: 'Polygon Mainnet',      chainId: 137,   explorer: 'https://polygonscan.com/tx/' },
  { id: '10',    name: 'OP Mainnet',           chainId: 10,    explorer: 'https://optimistic.etherscan.io/tx/' },
]

const PAGE_SIZE = 10000

const ACTION_LABELS = {
  txlist: 'Normal',
  txlistinternal: 'Internal',
  tokentx: 'ERC-20',
  tokennfttx: 'ERC-721',
  token1155tx: 'ERC-1155',
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(resolve, ms)
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

async function apiCall(chainId, params, signal, onLog, retries = 7) {
  let last = null
  for (let i = 0; i < retries; i++) {
    try {
      const fullParams = { chainid: String(chainId), ...params }
      if (ETHERSCAN_API_KEY) fullParams.apikey = ETHERSCAN_API_KEY
      const url = `${ETHERSCAN_V2}?${new URLSearchParams(fullParams)}`
      const res = await fetch(url, { signal })
      const json = await res.json()

      if (json.result === undefined) {
        last = json
        onLog?.(`Unexpected response (no result field), retrying... ${JSON.stringify(json).slice(0, 120)}`)
        await sleep(2000 + i * 1000, signal)
        continue
      }

      if (typeof json.result === 'string') {
        const lower = json.result.toLowerCase()
        if (lower.includes('rate limit') || lower.includes('max rate')) {
          onLog?.(`Rate limited, waiting ${Math.round(DELAY_MS / 1000)}s before retry ${i + 1}/${retries}...`)
          await sleep(DELAY_MS + i * 1000, signal)
          continue
        }
      }

      return json
    } catch (e) {
      if (e.name === 'AbortError') throw e
      last = e.message
      onLog?.(`Request error: ${e.message}, retry ${i + 1}/${retries}`)
    }
    await sleep(1000 + i * 1000, signal)
  }
  throw new Error(`API failed after ${retries} retries. Last: ${JSON.stringify(last)}`)
}

async function getBlockByTimestamp(chainId, timestamp, closest, signal, onLog) {
  const json = await apiCall(chainId, {
    module: 'block',
    action: 'getblocknobytime',
    timestamp: String(timestamp),
    closest,
  }, signal, onLog)
  await sleep(DELAY_MS, signal)
  const block = parseInt(json.result, 10)
  if (isNaN(block)) throw new Error(`Could not resolve block for timestamp ${timestamp}: ${JSON.stringify(json)}`)
  onLog?.(`Resolved timestamp ${timestamp} → block ${block}`)
  return block
}

function getDirection(tx, addr) {
  const from = (tx.from || '').toLowerCase()
  const to = (tx.to || '').toLowerCase()
  const a = addr.toLowerCase()
  const isFrom = from === a
  const isTo = to === a
  if (isFrom && isTo) return 'self'
  if (isFrom) return 'outgoing'
  if (isTo) return 'incoming'
  return 'related'
}

// Returns Map<hash, { from, to, nonce, direction }>
async function fetchAllPagesRich(chainId, address, action, startblock, endblock, signal, onProgress, onLog) {
  const txMap = new Map()
  let currentStart = startblock
  let chunk = 1

  while (true) {
    onLog?.(`[${action}] Chunk ${chunk}, fetching from block ${currentStart}...`)
    const json = await apiCall(chainId, {
      module: 'account',
      action,
      address,
      startblock: String(currentStart),
      endblock: String(endblock),
      page: '1',
      offset: String(PAGE_SIZE),
      sort: 'asc',
    }, signal, onLog)

    const result = json.result

    if (!Array.isArray(result) || result.length === 0) {
      const msg = typeof result === 'string' ? result : 'empty'
      onLog?.(`[${action}] Chunk ${chunk}: ${msg} — done with this endpoint`)
      break
    }

    for (const tx of result) {
      const hash = (tx.hash || tx.transactionHash || '').toLowerCase()
      if (!hash) continue
      if (!txMap.has(hash)) {
        txMap.set(hash, {
          from: (tx.from || '').toLowerCase(),
          to: (tx.to || '').toLowerCase(),
          nonce: tx.nonce || null,
          direction: getDirection(tx, address),
        })
      }
    }

    onLog?.(`[${action}] Chunk ${chunk}: ${result.length} txs, ${txMap.size} unique hashes so far`)
    onProgress({ action, page: chunk, found: txMap.size })

    if (result.length < PAGE_SIZE) break

    const lastBlock = parseInt(result[result.length - 1].blockNumber, 10)
    if (isNaN(lastBlock) || lastBlock <= currentStart) break

    currentStart = lastBlock
    chunk++
    await sleep(DELAY_MS, signal)
  }

  return txMap
}

export default function TxFetcher() {
  useEffect(() => {
    document.title = 'TX Fetcher'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  const [networks, setNetworks] = useState(FALLBACK_NETWORKS)
  const [selectedNetwork, setSelectedNetwork] = useState(FALLBACK_NETWORKS[0])
  const [address, setAddress] = useState('')
  const [fetchAll, setFetchAll] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [directionFilter, setDirectionFilter] = useState('all')
  const [nonceOnly, setNonceOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [hashes, setHashes] = useState([])
  const [hashMeta, setHashMeta] = useState({})
  const [highestNonce, setHighestNonce] = useState(null)
  const [error, setError] = useState(null)
  const [copyFeedback, setCopyFeedback] = useState('')
  const [logs, setLogs] = useState([])
  const [resultsPage, setResultsPage] = useState(0)
  const [pageSize, setPageSize] = useState(200)

  const abortRef = useRef(null)
  const logEndRef = useRef(null)
  const location = useLocation()

  useEffect(() => {
    fetch(CHAINLIST_URL)
      .then(r => r.json())
      .then(data => {
        const chains = parseChainlist(data)
        if (chains.length > 0) {
          setNetworks(chains)
          setSelectedNetwork(prev => chains.find(c => c.chainId === prev.chainId) || chains[0])
        }
      })
      .catch(() => { /* use fallback */ })
  }, [])

  const isValidAddress = address.match(/^0x[a-fA-F0-9]{40}$/)
  const canFetch = isValidAddress && !loading && (nonceOnly || fetchAll || (startDate && endDate))

  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${ts}] ${msg}`])
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const filteredHashes = hashes.filter(h => {
    if (directionFilter === 'all') return true
    const dir = hashMeta[h]?.direction
    if (directionFilter === 'outgoing') return dir === 'outgoing' || dir === 'self'
    if (directionFilter === 'incoming') return dir === 'incoming' || dir === 'self'
    return true
  })

  const handleFetch = useCallback(async () => {
    if (!canFetch) return

    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setLoading(true)
    setError(null)
    setHashes([])
    setHashMeta({})
    setHighestNonce(null)
    setLogs([])
    setResultsPage(0)
    setProgress({ action: 'Preparing...', page: 0, found: 0 })

    try {
      const { chainId } = selectedNetwork

      addLog(`Starting on ${selectedNetwork.name} (chainId ${chainId}) for ${address}`)
      addLog(`API: ${ETHERSCAN_V2}`)
      addLog(HAS_API_KEY ? `API key: active (${ETHERSCAN_API_KEY.slice(0, 4)}...${ETHERSCAN_API_KEY.slice(-4)}) — fast mode ~5 req/s` : 'No API key — slow mode ~1 req/5s')

      if (nonceOnly) {
        addLog('Nonce-only mode — calling eth_getTransactionCount...')
        setProgress({ action: 'Checking nonce...', page: 0, found: 0, step: 1, totalSteps: 1 })

        const json = await apiCall(chainId, {
          module: 'proxy',
          action: 'eth_getTransactionCount',
          address,
          tag: 'latest',
        }, signal, addLog)

        const txCount = parseInt(json.result, 16)
        if (isNaN(txCount)) throw new Error(`Unexpected response: ${JSON.stringify(json)}`)

        const maxNonce = txCount > 0 ? txCount - 1 : null
        setHashes([])
        setHashMeta({})
        setHighestNonce(maxNonce)
        setProgress(null)

        if (maxNonce !== null) {
          addLog(`Transaction count: ${txCount.toLocaleString()}`)
          addLog(`=== Max confirmed nonce: ${maxNonce.toLocaleString()} ===`)
        } else {
          addLog('=== No transactions found for this address ===')
        }

        trackUsage('txfetcher', 0)
      } else {
        addLog(`Direction filter: ${directionFilter}`)

        let startblock = 0
        let endblock = 999999999

        if (!fetchAll && startDate && endDate) {
          setProgress({ action: 'Resolving start block...', page: 0, found: 0 })
          addLog(`Resolving date range: ${startDate} → ${endDate}`)
          const startTs = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000)
          startblock = await getBlockByTimestamp(chainId, startTs, 'after', signal, addLog)

          setProgress({ action: 'Resolving end block...', page: 0, found: 0 })
          const endTs = Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000)
          endblock = await getBlockByTimestamp(chainId, endTs, 'before', signal, addLog)

          addLog(`Block range: ${startblock} → ${endblock}`)
        } else {
          addLog('Fetching ALL transactions (no date filter)')
        }

        const master = new Map()
        const actions = ['txlist', 'txlistinternal', 'tokentx', 'tokennfttx', 'token1155tx']
        let maxNonce = -1

        for (let i = 0; i < actions.length; i++) {
          const action = actions[i]
          const label = ACTION_LABELS[action]
          addLog(`--- Starting ${label} Transactions (${action}) [${i + 1}/${actions.length}] ---`)
          setProgress({ action: `${label} Transactions`, page: 0, found: master.size, step: i + 1, totalSteps: actions.length })

          const result = await fetchAllPagesRich(
            chainId, address, action, startblock, endblock, signal,
            ({ page, found }) => {
              setProgress({
                action: `${label} Transactions`,
                page,
                found: master.size + found,
                step: i + 1,
                totalSteps: actions.length,
              })
            },
            addLog
          )

          const beforeSize = master.size
          for (const [h, data] of result) {
            if (!master.has(h)) {
              master.set(h, { sources: new Set(), direction: data.direction, nonce: data.nonce })
            }
            master.get(h).sources.add(label)

            if (action === 'txlist' && (data.direction === 'outgoing' || data.direction === 'self') && data.nonce != null) {
              const n = parseInt(data.nonce, 10)
              if (!isNaN(n) && n > maxNonce) maxNonce = n
            }
          }
          addLog(`${label} Transactions: ${result.size} hashes (${master.size - beforeSize} new, ${master.size} total unique)`)

          if (i < actions.length - 1) {
            await sleep(DELAY_MS, signal)
          }
        }

        const sorted = [...master.keys()].sort()
        const meta = {}
        for (const [h, d] of master) {
          meta[h] = { sources: [...d.sources].sort().join('|'), direction: d.direction }
        }
        setHashes(sorted)
        setHashMeta(meta)
        if (maxNonce >= 0) setHighestNonce(maxNonce)
        setProgress(null)
        addLog(`=== Done! ${sorted.length} unique transaction hashes found ===`)
        if (maxNonce >= 0) addLog(`Highest confirmed outgoing nonce: ${maxNonce.toLocaleString()}`)

        trackUsage('txfetcher', sorted.length)
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        addLog('Cancelled by user.')
        setProgress(null)
        return
      }
      addLog(`ERROR: ${e.message}`)
      setError(e.message)
      setProgress(null)
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [canFetch, selectedNetwork, address, fetchAll, startDate, endDate, directionFilter, nonceOnly, addLog])

  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
  }

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(filteredHashes.join('\n'))
      setCopyFeedback('Copied!')
      setTimeout(() => setCopyFeedback(''), 2000)
    } catch {
      setCopyFeedback('Failed')
      setTimeout(() => setCopyFeedback(''), 2000)
    }
  }

  const handleCopyOne = async (hash) => {
    try {
      await navigator.clipboard.writeText(hash)
      setCopyFeedback(`Copied ${hash.slice(0, 10)}...`)
      setTimeout(() => setCopyFeedback(''), 1500)
    } catch { /* ignore */ }
  }

  const handleDownloadCSV = () => {
    const rows = filteredHashes.map(h => {
      const m = hashMeta[h] || {}
      return `${h},"${m.sources || ''}","${m.direction || ''}"`
    })
    const csv = 'txHash,sources,direction\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tx_hashes_${selectedNetwork.id}_${address.slice(0, 10)}_${directionFilter}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const progressPercent = progress
    ? Math.round(((progress.step || 1) - 1) / (progress.totalSteps || 3) * 100 + (progress.page > 0 ? 10 : 0))
    : 0

  return (
    <div className="txfetcher-page">
      <nav className="page-sidebar">
        <div className="sidebar-header">
          <h3>Navigation</h3>
        </div>
        <div className="sidebar-links">
          <Link to="/broadcaster" className={`sidebar-link ${location.pathname === '/broadcaster' ? 'active' : ''}`}>
            <span className="sidebar-icon">🚀</span>
            <span className="sidebar-text">Broadcaster</span>
          </Link>
          <Link to="/simulator" className={`sidebar-link ${location.pathname === '/simulator' ? 'active' : ''}`}>
            <span className="sidebar-icon">⚡</span>
            <span className="sidebar-text">Simulator</span>
          </Link>
          <Link to="/tx-fetcher" className={`sidebar-link ${location.pathname === '/tx-fetcher' ? 'active' : ''}`}>
            <span className="sidebar-icon">📥</span>
            <span className="sidebar-text">TX Fetcher</span>
          </Link>
          <Link to="/ton-details" className={`sidebar-link ${location.pathname === '/ton-details' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔍</span>
            <span className="sidebar-text">TON Details</span>
          </Link>
          <Link to="/ton-batch-lookup" className={`sidebar-link ${location.pathname === '/ton-batch-lookup' ? 'active' : ''}`}>
            <span className="sidebar-icon">📋</span>
            <span className="sidebar-text">TON Safe-to-Fail</span>
          </Link>
          <Link to="/ton-seqno-check" className={`sidebar-link ${location.pathname === '/ton-seqno-check' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔢</span>
            <span className="sidebar-text">TON Seqno Check</span>
          </Link>
          <Link to="/btc-safe-to-fail" className={`sidebar-link ${location.pathname === '/btc-safe-to-fail' ? 'active' : ''}`}>
            <span className="sidebar-icon">₿</span>
            <span className="sidebar-text">BTC Safe-to-Fail</span>
          </Link>
          <Link to="/btc-fetcher" className={`sidebar-link ${location.pathname === '/btc-fetcher' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔗</span>
            <span className="sidebar-text">BTC Fetcher</span>
          </Link>
          <Link to="/csv-builder" className={`sidebar-link ${location.pathname === '/csv-builder' ? 'active' : ''}`}>
            <span className="sidebar-icon">📊</span>
            <span className="sidebar-text">CSV Builder</span>
          </Link>
          <Link 
            to="/faucet" 
            className={`sidebar-link ${location.pathname === '/faucet' ? 'active' : ''}`}
          >
            <span className="sidebar-icon">🚰</span>
            <span className="sidebar-text">Faucet</span>
          </Link>
          <Link to="/webhook-tester" className={`sidebar-link ${location.pathname === '/webhook-tester' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔗</span>
            <span className="sidebar-text">Webhook Tester</span>
          </Link>
          <Link to="/callback-handler" className={`sidebar-link ${location.pathname === '/callback-handler' ? 'active' : ''}`}>
            <span className="sidebar-icon">🛡️</span>
            <span className="sidebar-text">Callback Handler</span>
          </Link>
          <Link to="/easy-cosigner" className={`sidebar-link ${location.pathname === '/easy-cosigner' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔐</span>
            <span className="sidebar-text">Easy Cosigner</span>
          </Link>
        </div>
      </nav>

      <div className="txfetcher-container">
        <header className="txfetcher-header">
          <h1>📥 TX Hash Fetcher</h1>
          <p>Fetch all unique transaction hashes for any EVM wallet address.</p>
        </header>

        <section className="txfetcher-section">
          <label className="txfetcher-label">Network</label>
          <select
            className="txfetcher-dropdown"
            value={selectedNetwork.id}
            onChange={(e) => {
              const net = networks.find(n => n.id === e.target.value)
              if (net) setSelectedNetwork(net)
            }}
          >
            {networks.map(n => (
              <option key={n.id} value={n.id}>{n.name} ({n.chainId})</option>
            ))}
          </select>
          {HAS_API_KEY ? (
            <div className="api-info api-info-ok">
              Etherscan V2 API key active — fast mode (~5 requests/sec), works across all chains
            </div>
          ) : (
            <div className="api-info">
              No API key — rate limited to ~1 request per 5 seconds. Set VITE_ETHERSCAN_API_KEY to speed this up.
            </div>
          )}
        </section>

        <section className="txfetcher-section">
          <label className="txfetcher-label">Wallet Address</label>
          <input
            className="txfetcher-input"
            type="text"
            placeholder="0x..."
            value={address}
            onChange={(e) => setAddress(e.target.value.trim())}
            spellCheck={false}
          />
          {address && !isValidAddress && (
            <div className="error-box" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
              Invalid address format. Must be 0x followed by 40 hex characters.
            </div>
          )}
        </section>

        <section className="txfetcher-section">
          <label className={`nonce-only-toggle ${nonceOnly ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={nonceOnly}
              onChange={(e) => setNonceOnly(e.target.checked)}
            />
            <span>Max Confirmed Nonce Only</span>
          </label>
          {nonceOnly && (
            <div className="nonce-only-hint">
              Grabs the highest confirmed nonce for this address. All other options are disabled.
            </div>
          )}
        </section>

        <section className={`txfetcher-section ${nonceOnly ? 'section-disabled' : ''}`}>
          <label className="txfetcher-label">Direction Filter</label>
          <div className="direction-options">
            {['all', 'outgoing', 'incoming'].map(opt => (
              <label key={opt} className={`direction-option ${directionFilter === opt ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="direction"
                  value={opt}
                  checked={directionFilter === opt}
                  onChange={() => { setDirectionFilter(opt); setResultsPage(0) }}
                  disabled={nonceOnly}
                />
                <span>{opt === 'all' ? 'All Transactions' : opt === 'outgoing' ? 'Outgoing Only (sent from address)' : 'Incoming Only (received by address)'}</span>
              </label>
            ))}
          </div>
        </section>

        <section className={`txfetcher-section ${nonceOnly ? 'section-disabled' : ''}`}>
          <label className="txfetcher-label">Date Range</label>
          <div className="date-range-controls">
            <label className="date-range-toggle">
              <input
                type="checkbox"
                checked={fetchAll}
                onChange={(e) => setFetchAll(e.target.checked)}
                disabled={nonceOnly}
              />
              <span>Fetch ALL transactions (no date filter)</span>
            </label>
            {!fetchAll && (
              <>
                <div className="date-inputs">
                  <div className="date-field">
                    <label>Start Date (inclusive)</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <span className="date-separator">→</span>
                  <div className="date-field">
                    <label>End Date (inclusive)</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="date-hint">
                  Both dates are inclusive. Uses UTC — start date begins at 00:00 UTC, end date runs through 23:59:59 UTC.
                </div>
              </>
            )}
          </div>
        </section>

        <section className="fetch-section">
          <div className="fetch-buttons">
            <button
              className="fetch-btn"
              onClick={handleFetch}
              disabled={!canFetch}
            >
              {loading ? (
                <>
                  <span className="fetch-spinner" />
                  Fetching...
                </>
              ) : (
                <>{nonceOnly ? 'Check Max Nonce' : 'Fetch TX Hashes'}</>
              )}
            </button>
            {loading && (
              <button className="cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
            )}
          </div>

          {progress && (
            <div className="progress-info">
              <div className="progress-status">
                Step <strong>{progress.step || '?'}/{progress.totalSteps || 3}</strong>: {progress.action}
                {progress.page > 0 && ` (chunk ${progress.page})`}
              </div>
              <div className="progress-detail">
                {progress.found} unique hashes found so far
              </div>
              <div className="progress-bar-wrapper">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${Math.min(progressPercent, 95)}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {logs.length > 0 && (
          <section className="txfetcher-section">
            <label className="txfetcher-label">Activity Log</label>
            <div className="activity-log">
              {logs.map((log, i) => (
                <div key={i} className={`log-line${log.includes('ERROR') ? ' log-error' : log.includes('===') ? ' log-success' : log.includes('Rate limited') ? ' log-warn' : log.includes('Highest confirmed') ? ' log-success' : ''}`}>
                  {log}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </section>
        )}

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        {nonceOnly && !loading && highestNonce !== null && (
          <section className="nonce-result-section">
            <div className="nonce-result-card">
              <div className="nonce-result-label">Max Confirmed Nonce</div>
              <div className="nonce-result-value">{highestNonce.toLocaleString()}</div>
              <div className="nonce-result-addr">{address}</div>
            </div>
          </section>
        )}

        {hashes.length > 0 && (() => {
          const displayHashes = filteredHashes
          const totalPages = Math.ceil(displayHashes.length / pageSize)
          const startIdx = resultsPage * pageSize
          const endIdx = Math.min(startIdx + pageSize, displayHashes.length)
          const pageHashes = displayHashes.slice(startIdx, endIdx)

          return (
            <section className="results-section">
              <div className="results-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <h3>Results</h3>
                  <span className="results-count">
                    {displayHashes.length.toLocaleString()} {directionFilter !== 'all' ? `${directionFilter} ` : ''}hashes
                    {directionFilter !== 'all' && ` (${hashes.length.toLocaleString()} total)`}
                  </span>
                  {highestNonce !== null && (
                    <span className="nonce-badge">Highest nonce: {highestNonce.toLocaleString()}</span>
                  )}
                </div>
                <div className="results-actions">
                  <button className="copy-btn" onClick={handleCopyAll}>
                    {copyFeedback || `Copy All ${displayHashes.length.toLocaleString()}`}
                  </button>
                  <button className="download-btn" onClick={handleDownloadCSV}>
                    Download CSV
                  </button>
                </div>
              </div>

              <div className="results-pagination-bar">
                <div className="page-size-control">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setResultsPage(0) }}
                    className="page-size-select"
                  >
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value={1000}>1,000</option>
                  </select>
                  <span>per page</span>
                </div>
                <div className="page-range-info">
                  Showing {(startIdx + 1).toLocaleString()}–{endIdx.toLocaleString()} of {displayHashes.length.toLocaleString()}
                </div>
              </div>

              <div className="hash-list">
                {pageHashes.map((hash, i) => {
                  const m = hashMeta[hash] || {}
                  return (
                    <div className="hash-item" key={hash}>
                      <span className="hash-index">{(startIdx + i + 1).toLocaleString()}</span>
                      <a
                        className="hash-value"
                        href={`${selectedNetwork.explorer}${hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {hash}
                      </a>
                      {m.direction && (
                        <span className={`hash-direction dir-${m.direction}`}>{m.direction}</span>
                      )}
                      {m.sources && (
                        <span className="hash-sources">{m.sources}</span>
                      )}
                      <button className="hash-copy-btn" onClick={() => handleCopyOne(hash)}>
                        Copy
                      </button>
                    </div>
                  )
                })}
              </div>

              {totalPages > 1 && (
                <div className="results-pagination">
                  <button className="pagination-btn" disabled={resultsPage === 0} onClick={() => setResultsPage(0)}>First</button>
                  <button className="pagination-btn" disabled={resultsPage === 0} onClick={() => setResultsPage(p => p - 1)}>Prev</button>
                  <span className="pagination-info">Page {resultsPage + 1} of {totalPages.toLocaleString()}</span>
                  <button className="pagination-btn" disabled={resultsPage >= totalPages - 1} onClick={() => setResultsPage(p => p + 1)}>Next</button>
                  <button className="pagination-btn" disabled={resultsPage >= totalPages - 1} onClick={() => setResultsPage(totalPages - 1)}>Last</button>
                </div>
              )}
            </section>
          )
        })()}

        {!loading && !error && hashes.length === 0 && address && (
          <div className="empty-results">
            <p>Enter an address and click Fetch to retrieve transaction hashes.</p>
          </div>
        )}
      </div>
    </div>
  )
}
