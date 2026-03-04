import { useState, useRef, useCallback, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { trackUsage } from '../utils/counter'
import './TxFetcher.css'

const ETHERSCAN_API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY || ''
const HAS_API_KEY = ETHERSCAN_API_KEY.length > 0

// Etherscan V2 multichain API — single key works across all supported chains
const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api'
const DELAY_MS = HAS_API_KEY ? 250 : 5500

const NETWORKS = [
  { id: 'ethereum',  name: 'Ethereum',              chainId: 1,     explorer: 'https://etherscan.io/tx/' },
  { id: 'hyperevm',  name: 'HyperEVM (Hyperliquid)', chainId: 999,  explorer: 'https://hyperliquid.calderaexplorer.xyz/tx/' },
  { id: 'base',      name: 'Base',                  chainId: 8453,  explorer: 'https://basescan.org/tx/' },
  { id: 'arbitrum',  name: 'Arbitrum One',          chainId: 42161, explorer: 'https://arbiscan.io/tx/' },
  { id: 'optimism',  name: 'Optimism',              chainId: 10,    explorer: 'https://optimistic.etherscan.io/tx/' },
  { id: 'polygon',   name: 'Polygon',               chainId: 137,   explorer: 'https://polygonscan.com/tx/' },
  { id: 'bsc',       name: 'BNB Smart Chain',       chainId: 56,    explorer: 'https://bscscan.com/tx/' },
  { id: 'avalanche', name: 'Avalanche C-Chain',     chainId: 43114, explorer: 'https://snowtrace.io/tx/' },
  { id: 'fantom',    name: 'Fantom',                chainId: 250,   explorer: 'https://ftmscan.com/tx/' },
  { id: 'linea',     name: 'Linea',                 chainId: 59144, explorer: 'https://lineascan.build/tx/' },
  { id: 'gnosis',    name: 'Gnosis Chain',          chainId: 100,   explorer: 'https://gnosisscan.io/tx/' },
  { id: 'celo',      name: 'Celo',                  chainId: 42220, explorer: 'https://celoscan.io/tx/' },
  { id: 'moonbeam',  name: 'Moonbeam',              chainId: 1284,  explorer: 'https://moonscan.io/tx/' },
  { id: 'zkevm',     name: 'Polygon zkEVM',         chainId: 1101,  explorer: 'https://zkevm.polygonscan.com/tx/' },
]

const PAGE_SIZE = 10000

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

async function getExpectedCount(chainId, address, action, signal, onLog) {
  let total = 0
  let page = 1
  try {
    while (true) {
      const json = await apiCall(chainId, {
        module: 'account',
        action,
        address,
        startblock: '0',
        endblock: '999999999',
        page: String(page),
        offset: String(PAGE_SIZE),
        sort: 'asc',
      }, signal, onLog)
      const result = json.result
      if (!Array.isArray(result) || result.length === 0) break
      total += result.length
      if (result.length < PAGE_SIZE) break
      page++
      await sleep(DELAY_MS, signal)
    }
    onLog?.(`Verification count for ${action}: ${total.toLocaleString()} (via page-based pagination)`)
    return total
  } catch { /* non-critical */ }
  return null
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

async function fetchAllPages(chainId, address, action, startblock, endblock, signal, onProgress, onLog) {
  const hashes = new Set()
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
      const hash = tx.hash || tx.transactionHash
      if (hash) hashes.add(hash.toLowerCase())
    }

    onLog?.(`[${action}] Chunk ${chunk}: ${result.length} txs, ${hashes.size} unique hashes so far`)
    onProgress({ action, page: chunk, found: hashes.size })

    if (result.length < PAGE_SIZE) break

    const lastBlock = parseInt(result[result.length - 1].blockNumber, 10)
    if (isNaN(lastBlock) || lastBlock <= currentStart) break

    currentStart = lastBlock
    chunk++
    await sleep(DELAY_MS, signal)
  }

  return hashes
}

export default function TxFetcher() {
  const [selectedNetwork, setSelectedNetwork] = useState(NETWORKS[0])
  const [address, setAddress] = useState('')
  const [fetchAll, setFetchAll] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [hashes, setHashes] = useState([])
  const [error, setError] = useState(null)
  const [copyFeedback, setCopyFeedback] = useState('')
  const [logs, setLogs] = useState([])
  const [resultsPage, setResultsPage] = useState(0)
  const [pageSize, setPageSize] = useState(200)

  const abortRef = useRef(null)
  const logEndRef = useRef(null)
  const location = useLocation()

  const isValidAddress = address.match(/^0x[a-fA-F0-9]{40}$/)

  const canFetch = isValidAddress && !loading && (fetchAll || (startDate && endDate))

  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${ts}] ${msg}`])
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleFetch = useCallback(async () => {
    if (!canFetch) return

    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setLoading(true)
    setError(null)
    setHashes([])
    setLogs([])
    setResultsPage(0)
    setProgress({ action: 'Preparing...', page: 0, found: 0 })

    try {
      const { chainId } = selectedNetwork
      let startblock = 0
      let endblock = 999999999

      addLog(`Starting fetch on ${selectedNetwork.name} (chainId ${chainId}) for ${address}`)
      addLog(`API: ${ETHERSCAN_V2}`)
      addLog(HAS_API_KEY ? `API key: active (${ETHERSCAN_API_KEY.slice(0, 4)}...${ETHERSCAN_API_KEY.slice(-4)}) — fast mode ~5 req/s` : 'No API key — slow mode ~1 req/5s')

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

      const allHashes = new Set()
      const actions = ['txlist', 'txlistinternal', 'tokentx', 'tokennfttx', 'token1155tx']
      const actionLabels = {
        txlist: 'Normal Transactions',
        txlistinternal: 'Internal Transactions',
        tokentx: 'ERC-20 Token Transfers',
        tokennfttx: 'ERC-721 NFT Transfers',
        token1155tx: 'ERC-1155 Transfers',
      }

      const perEndpoint = {}
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i]
        addLog(`--- Starting ${actionLabels[action]} (${action}) [${i + 1}/${actions.length}] ---`)
        setProgress({ action: actionLabels[action], page: 0, found: allHashes.size, step: i + 1, totalSteps: actions.length })

        const result = await fetchAllPages(
          chainId, address, action, startblock, endblock, signal,
          ({ page, found }) => {
            setProgress({
              action: actionLabels[action],
              page,
              found: allHashes.size + found,
              step: i + 1,
              totalSteps: actions.length,
            })
          },
          addLog
        )

        perEndpoint[action] = result.size
        const beforeSize = allHashes.size
        for (const h of result) allHashes.add(h)
        addLog(`${actionLabels[action]}: ${result.size} hashes (${allHashes.size - beforeSize} new, ${allHashes.size} total unique)`)

        if (i < actions.length - 1) {
          await sleep(DELAY_MS, signal)
        }
      }

      const sorted = [...allHashes].sort()
      setHashes(sorted)
      setProgress(null)
      addLog(`=== Done! ${sorted.length} unique transaction hashes found ===`)

      if (fetchAll) {
        addLog('--- Verification (checked AFTER scan to account for new activity) ---')
        const checks = ['txlist', 'txlistinternal', 'tokentx']
        for (const action of checks) {
          const expected = await getExpectedCount(chainId, address, action, signal, addLog)
          if (expected === null) continue
          const found = perEndpoint[action] || 0
          if (found >= expected) {
            addLog(`VERIFIED ${action}: found ${found.toLocaleString()} unique hashes, API reports ${expected.toLocaleString()} total rows — all accounted for`)
          } else {
            const missing = expected - found
            addLog(`WARNING ${action}: found ${found.toLocaleString()} unique hashes but API reports ${expected.toLocaleString()} total rows — ${missing.toLocaleString()} may be missing (possible indexing gap)`)
          }
          await sleep(DELAY_MS, signal)
        }
      }

      trackUsage('txfetcher', sorted.length)
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
  }, [canFetch, selectedNetwork, address, fetchAll, startDate, endDate, addLog])

  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
  }

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(hashes.join('\n'))
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
    const csv = 'txHash\n' + hashes.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tx_hashes_${selectedNetwork.id}_${address.slice(0, 10)}.csv`
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
          <Link
            to="/broadcaster"
            className={`sidebar-link ${location.pathname === '/broadcaster' ? 'active' : ''}`}
          >
            <span className="sidebar-icon">🚀</span>
            <span className="sidebar-text">Broadcaster</span>
          </Link>
          <Link
            to="/simulator"
            className={`sidebar-link ${location.pathname === '/simulator' ? 'active' : ''}`}
          >
            <span className="sidebar-icon">⚡</span>
            <span className="sidebar-text">Simulator</span>
          </Link>
          <Link
            to="/tx-fetcher"
            className={`sidebar-link ${location.pathname === '/tx-fetcher' ? 'active' : ''}`}
          >
            <span className="sidebar-icon">📥</span>
            <span className="sidebar-text">TX Fetcher</span>
          </Link>
          <Link
            to="/ton-details"
            className={`sidebar-link ${location.pathname === '/ton-details' ? 'active' : ''}`}
          >
            <span className="sidebar-icon">🔍</span>
            <span className="sidebar-text">Ton Details</span>
          </Link>
          <Link
            to="/ton-batch-lookup"
            className={`sidebar-link ${location.pathname === '/ton-batch-lookup' ? 'active' : ''}`}
          >
            <span className="sidebar-icon">📋</span>
            <span className="sidebar-text">TON Batch Lookup</span>
          </Link>
          <Link
            to="/btc-safe-to-fail"
            className={`sidebar-link ${location.pathname === '/btc-safe-to-fail' ? 'active' : ''}`}
          >
            <span className="sidebar-icon">₿</span>
            <span className="sidebar-text">BTC Safe-to-Fail</span>
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
              const net = NETWORKS.find(n => n.id === e.target.value)
              if (net) setSelectedNetwork(net)
            }}
          >
            {NETWORKS.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
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
          <label className="txfetcher-label">Date Range</label>
          <div className="date-range-controls">
            <label className="date-range-toggle">
              <input
                type="checkbox"
                checked={fetchAll}
                onChange={(e) => setFetchAll(e.target.checked)}
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
                <>Fetch TX Hashes</>
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
                <div key={i} className={`log-line${log.includes('ERROR') ? ' log-error' : log.includes('===') ? ' log-success' : log.includes('Rate limited') ? ' log-warn' : ''}`}>
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

        {hashes.length > 0 && (() => {
          const totalPages = Math.ceil(hashes.length / pageSize)
          const startIdx = resultsPage * pageSize
          const endIdx = Math.min(startIdx + pageSize, hashes.length)
          const pageHashes = hashes.slice(startIdx, endIdx)

          return (
            <section className="results-section">
              <div className="results-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <h3>Results</h3>
                  <span className="results-count">{hashes.length.toLocaleString()} unique hashes</span>
                </div>
                <div className="results-actions">
                  <button className="copy-btn" onClick={handleCopyAll}>
                    {copyFeedback || `Copy All ${hashes.length.toLocaleString()}`}
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
                  Showing {(startIdx + 1).toLocaleString()}–{endIdx.toLocaleString()} of {hashes.length.toLocaleString()}
                </div>
              </div>

              <div className="hash-list">
                {pageHashes.map((hash, i) => (
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
                    <button className="hash-copy-btn" onClick={() => handleCopyOne(hash)}>
                      Copy
                    </button>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="results-pagination">
                  <button
                    className="pagination-btn"
                    disabled={resultsPage === 0}
                    onClick={() => setResultsPage(0)}
                  >
                    First
                  </button>
                  <button
                    className="pagination-btn"
                    disabled={resultsPage === 0}
                    onClick={() => setResultsPage(p => p - 1)}
                  >
                    Prev
                  </button>
                  <span className="pagination-info">
                    Page {resultsPage + 1} of {totalPages.toLocaleString()}
                  </span>
                  <button
                    className="pagination-btn"
                    disabled={resultsPage >= totalPages - 1}
                    onClick={() => setResultsPage(p => p + 1)}
                  >
                    Next
                  </button>
                  <button
                    className="pagination-btn"
                    disabled={resultsPage >= totalPages - 1}
                    onClick={() => setResultsPage(totalPages - 1)}
                  >
                    Last
                  </button>
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
