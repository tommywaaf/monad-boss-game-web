import { useState, useRef, useCallback, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { trackUsage } from '../utils/counter'
import './TxFetcher.css'

const NETWORKS = [
  {
    id: 'ethereum',
    name: 'Ethereum',
    apiBase: 'https://api.etherscan.io/api',
    explorer: 'https://etherscan.io/tx/',
    delayMs: 5500,
  },
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

async function apiCall(apiBase, params, signal, delayMs, onLog, retries = 7) {
  let last = null
  for (let i = 0; i < retries; i++) {
    try {
      const url = `${apiBase}?${new URLSearchParams(params)}`
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
          onLog?.(`Rate limited, waiting ${Math.round(delayMs / 1000)}s before retry ${i + 1}/${retries}...`)
          await sleep(delayMs + i * 1000, signal)
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

async function getBlockByTimestamp(apiBase, timestamp, closest, signal, delayMs, onLog) {
  const json = await apiCall(apiBase, {
    module: 'block',
    action: 'getblocknobytime',
    timestamp: String(timestamp),
    closest,
  }, signal, delayMs, onLog)
  await sleep(delayMs, signal)
  const block = parseInt(json.result, 10)
  if (isNaN(block)) throw new Error(`Could not resolve block for timestamp ${timestamp}: ${JSON.stringify(json)}`)
  onLog?.(`Resolved timestamp ${timestamp} → block ${block}`)
  return block
}

async function fetchAllPages(apiBase, address, action, startblock, endblock, delayMs, signal, onProgress, onLog) {
  const hashes = new Set()
  let page = 1

  while (true) {
    onLog?.(`[${action}] Fetching page ${page} (blocks ${startblock}–${endblock})...`)
    const json = await apiCall(apiBase, {
      module: 'account',
      action,
      address,
      startblock: String(startblock),
      endblock: String(endblock),
      page: String(page),
      offset: String(PAGE_SIZE),
      sort: 'asc',
    }, signal, delayMs, onLog)

    const result = json.result

    if (!Array.isArray(result) || result.length === 0) {
      const msg = typeof result === 'string' ? result : 'empty'
      onLog?.(`[${action}] Page ${page}: ${msg} — done with this endpoint`)
      break
    }

    for (const tx of result) {
      const hash = tx.hash || tx.transactionHash
      if (hash) hashes.add(hash.toLowerCase())
    }

    onLog?.(`[${action}] Page ${page}: ${result.length} txs, ${hashes.size} unique hashes so far`)
    onProgress({ action, page, found: hashes.size })

    if (result.length < PAGE_SIZE) break
    page++
    await sleep(delayMs, signal)
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
      const { apiBase, delayMs } = selectedNetwork
      let startblock = 0
      let endblock = 99999999

      addLog(`Starting fetch on ${selectedNetwork.name} for ${address}`)
      addLog(`API: ${apiBase}`)

      if (!fetchAll && startDate && endDate) {
        setProgress({ action: 'Resolving start block...', page: 0, found: 0 })
        addLog(`Resolving date range: ${startDate} → ${endDate}`)
        const startTs = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000)
        startblock = await getBlockByTimestamp(apiBase, startTs, 'after', signal, delayMs, addLog)

        setProgress({ action: 'Resolving end block...', page: 0, found: 0 })
        const endTs = Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000)
        endblock = await getBlockByTimestamp(apiBase, endTs, 'before', signal, delayMs, addLog)

        addLog(`Block range: ${startblock} → ${endblock}`)
      } else {
        addLog('Fetching ALL transactions (no date filter)')
      }

      const allHashes = new Set()
      const actions = ['txlist', 'txlistinternal', 'tokentx']
      const actionLabels = {
        txlist: 'Normal Transactions',
        txlistinternal: 'Internal Transactions',
        tokentx: 'Token Transfers',
      }

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i]
        addLog(`--- Starting ${actionLabels[action]} (${action}) ---`)
        setProgress({ action: actionLabels[action], page: 0, found: allHashes.size, step: i + 1, totalSteps: 3 })

        const result = await fetchAllPages(
          apiBase, address, action, startblock, endblock, delayMs, signal,
          ({ page, found }) => {
            setProgress({
              action: actionLabels[action],
              page,
              found: allHashes.size + found,
              step: i + 1,
              totalSteps: 3,
            })
          },
          addLog
        )

        const beforeSize = allHashes.size
        for (const h of result) allHashes.add(h)
        addLog(`${actionLabels[action]}: ${result.size} hashes (${allHashes.size - beforeSize} new, ${allHashes.size} total unique)`)

        if (i < actions.length - 1) {
          await sleep(delayMs, signal)
        }
      }

      const sorted = [...allHashes].sort()
      setHashes(sorted)
      setProgress(null)
      addLog(`=== Done! ${sorted.length} unique transaction hashes found ===`)
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
          <div className="api-info">
            No API key — rate limited to ~1 request per 5 seconds. Large wallets may take a while.
          </div>
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
              <div className="date-inputs">
                <div className="date-field">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <span className="date-separator">→</span>
                <div className="date-field">
                  <label>End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
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
                {progress.page > 0 && ` (page ${progress.page})`}
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
