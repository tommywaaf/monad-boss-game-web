import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { trackUsage } from '../utils/counter'
import './TonBatchLookup.css'

const TONCENTER = "https://toncenter.com"
const TX_HEX_RE = /^[0-9a-fA-F]{64}$/
const PAGE_SIZE = 100
const UI_UPDATE_INTERVAL_MS = 150  // how often to push results to React state

// ── Utilities ──────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function txHexToB64(hex64) {
  const hex = hex64.toLowerCase()
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('')
  return btoa(binary)
}

function getSession() {
  const apiKey = import.meta.env.VITE_TONCENTER_API_KEY
  const headers = { 'User-Agent': 'ton-batch-lookup/1.0' }
  if (apiKey) headers['X-API-Key'] = apiKey
  return { headers }
}

// ── Fetch with retry/back-off ──────────────────────────────────────────────

async function fetchJson(session, url, params, signal, requestDelayMs) {
  const queryString = new URLSearchParams(params).toString()
  const fullUrl = `${url}?${queryString}`

  for (let attempt = 1; attempt <= 4; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    await sleep(requestDelayMs + Math.random() * 100)

    try {
      const response = await fetch(fullUrl, {
        headers: session.headers,
        signal: AbortSignal.timeout(20000),
      })

      if (response.status === 200) return await response.json()

      if ([429, 500, 502, 503, 504].includes(response.status)) {
        const waitMs = 2000 * Math.pow(2, attempt - 1) + Math.random() * 500
        await sleep(waitMs)
        continue
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    } catch (e) {
      if (e.name === 'AbortError') throw e
      if (e.name === 'TimeoutError' && attempt < 4) { await sleep(3000); continue }
      throw e
    }
  }

  throw new Error('Max retries exceeded')
}

// ── Status from transaction description ───────────────────────────────────

function getTxStatus(tx) {
  const desc = tx?.description
  if (!desc) return 'unknown'

  if (desc.aborted === true) return 'failed'

  const cp = desc.compute_ph
  if (cp) {
    if (cp.skipped) return 'skipped'
    if (cp.success === false) return 'failed'
  }

  const ap = desc.action
  if (ap) {
    if (ap.success === false) return 'failed'
    // All actions skipped → full failure
    if (ap.skipped_actions > 0 && ap.skipped_actions === ap.tot_actions) return 'failed'
    // Some (but not all) actions skipped → partial failure
    if (ap.skipped_actions > 0 && ap.skipped_actions < ap.tot_actions) return 'partial'
  }

  if (cp?.success === true) return 'success'

  return 'unknown'
}

// ── Single hash lookup ─────────────────────────────────────────────────────

async function lookupHash(session, hex64, signal, requestDelayMs) {
  let tx = null
  let mode = null

  // 1) Try as message hash (tonscan workflow)
  const msgHashB64 = txHexToB64(hex64)
  const byMsg = await fetchJson(
    session,
    `${TONCENTER}/api/v3/transactionsByMessage`,
    { msg_hash: msgHashB64, limit: 1 },
    signal,
    requestDelayMs,
  )
  const txsByMsg = byMsg?.transactions || []
  if (txsByMsg.length > 0) {
    tx   = txsByMsg[0]
    mode = 'message'
  }

  // 2) Fallback: try as transaction hash (tonviewer workflow)
  if (!tx) {
    const byTx = await fetchJson(
      session,
      `${TONCENTER}/api/v3/transactions`,
      { hash: hex64, limit: 1 },
      signal,
      requestDelayMs,
    )
    const txsByHash = byTx?.transactions || []
    if (txsByHash.length > 0) {
      tx   = txsByHash[0]
      mode = 'transaction'
    }
  }

  if (!tx) return { found: false, mode: null, status: null }

  // 3) Check the outer-transaction description (compute + action phase)
  const txStatus = getTxStatus(tx)

  // Already clearly failed at the transaction level — no need to dig deeper
  if (txStatus === 'failed') {
    return { found: true, mode, status: 'failed' }
  }

  // 4) Check trace-level actions for inner failures.
  //    A transaction can be "Confirmed" on-chain while a child action inside
  //    the same trace (e.g. Transfer TON) shows as Failed — tonviewer displays
  //    exactly this pattern. We must inspect every action in the trace.
  const traceId = tx.trace_id
  if (traceId) {
    try {
      const actData = await fetchJson(
        session,
        `${TONCENTER}/api/v3/actions`,
        { trace_id: traceId, limit: 100, include_transactions: 'false' },
        signal,
        requestDelayMs,
      )
      const actions = actData?.actions || []
      const hasFailedAction = actions.some(a => a.status === 'failed')
      if (hasFailedAction) {
        return { found: true, mode, status: 'failed' }
      }
    } catch (e) {
      // Actions fetch failed — fall through to tx-level status
      if (e.name === 'AbortError') throw e
    }
  }

  return { found: true, mode, status: txStatus }
}

// ── ETA formatting ─────────────────────────────────────────────────────────

function formatEta(remainingMs) {
  if (!isFinite(remainingMs) || remainingMs < 0) return '—'
  const s = Math.round(remainingMs / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const leftS = s % 60
  if (m < 60) return `${m}m ${leftS}s`
  const h = Math.floor(m / 60)
  const leftM = m % 60
  return `${h}h ${leftM}m`
}

function formatRate(rate) {
  if (!isFinite(rate) || rate <= 0) return '—'
  return `${rate.toFixed(1)}/s`
}

// ── Main component ─────────────────────────────────────────────────────────

function TonBatchLookup() {
  const location = useLocation()

  // ── Input & settings ──
  const [input, setInput]               = useState('')
  const [concurrency, setConcurrency]   = useState(5)
  const [requestDelay, setRequestDelay] = useState(200)  // ms per request

  // ── Processing state ──
  const [processing, setProcessing]     = useState(false)
  const [progress, setProgress]         = useState({ completed: 0, total: 0, startTime: null })

  // ── Results ──
  const [results, setResults]           = useState([])   // [{hash, found, mode, status, error}]
  const [page, setPage]                 = useState(0)
  const [filter, setFilter]             = useState('all')

  // ── Refs for non-reactive hot-path data ──
  const abortRef      = useRef(null)       // AbortController
  const resultsRef    = useRef([])         // live results array (pre-React)
  const progressRef   = useRef({ completed: 0, total: 0, startTime: null })
  const uiTimerRef    = useRef(null)

  // Debounced hash count from textarea
  const hashCount = useMemo(() => {
    if (!input.trim()) return 0
    return input.trim().split(/[\s,\n]+/).filter(x => TX_HEX_RE.test(x.trim())).length
  }, [input])

  // ETA estimate pre-run (rough: 2 API calls per hash, delay + network)
  const estimatedMs = useMemo(() => {
    if (!hashCount) return 0
    // Each hash: 2 calls worst case, each call = requestDelay + ~500ms network
    const msPerHash = (2 * (requestDelay + 500)) / concurrency
    return hashCount * msPerHash
  }, [hashCount, concurrency, requestDelay])

  // ── Periodic UI update during processing ──
  useEffect(() => {
    if (processing) {
      uiTimerRef.current = setInterval(() => {
        setProgress({ ...progressRef.current })
        setResults([...resultsRef.current])
      }, UI_UPDATE_INTERVAL_MS)
    } else {
      if (uiTimerRef.current) {
        clearInterval(uiTimerRef.current)
        uiTimerRef.current = null
      }
    }
    return () => {
      if (uiTimerRef.current) clearInterval(uiTimerRef.current)
    }
  }, [processing])

  // ── Process ──────────────────────────────────────────────────────────────

  const handleProcess = useCallback(async () => {
    const rawHashes = input.trim().split(/[\s,\n]+/).filter(x => TX_HEX_RE.test(x.trim()))
    if (rawHashes.length === 0) return

    const hashes = rawHashes.map(h => h.trim().toLowerCase())

    trackUsage('ton-batch', hashes.length)

    const controller = new AbortController()
    abortRef.current = controller

    // Reset state
    resultsRef.current = new Array(hashes.length).fill(null)
    progressRef.current = { completed: 0, total: hashes.length, startTime: Date.now() }
    setProcessing(true)
    setResults([])
    setPage(0)
    setFilter('all')

    const session = getSession()
    let nextIdx = 0
    let completed = 0
    const signal = controller.signal

    const worker = async () => {
      while (true) {
        if (signal.aborted) break
        const i = nextIdx++
        if (i >= hashes.length) break

        try {
          const data = await lookupHash(session, hashes[i], signal, requestDelay)
          resultsRef.current[i] = { hash: hashes[i], ...data, error: null }
        } catch (e) {
          if (e.name === 'AbortError') {
            resultsRef.current[i] = { hash: hashes[i], found: false, mode: null, status: null, error: 'Aborted' }
          } else {
            resultsRef.current[i] = { hash: hashes[i], found: false, mode: null, status: null, error: e.message }
          }
        }

        completed++
        progressRef.current = { ...progressRef.current, completed }
      }
    }

    // Run N concurrent workers
    await Promise.all(Array.from({ length: concurrency }, worker))

    // Final flush
    setProgress({ ...progressRef.current, completed: progressRef.current.completed })
    setResults(resultsRef.current.filter(r => r !== null))
    setProcessing(false)
  }, [input, concurrency, requestDelay])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const valid = results.filter(r => r !== null)
    return {
      total:    valid.length,
      found:    valid.filter(r => r.found).length,
      notFound: valid.filter(r => !r.found && !r.error).length,
      success:  valid.filter(r => r.status === 'success').length,
      failed:   valid.filter(r => r.status === 'failed').length,
      partial:  valid.filter(r => r.status === 'partial').length,
      skipped:  valid.filter(r => r.status === 'skipped').length,
      unknown:  valid.filter(r => r.found && r.status === 'unknown').length,
      errors:   valid.filter(r => r.error && r.error !== 'Aborted').length,
    }
  }, [results])

  // ── Filtered results ──────────────────────────────────────────────────────

  const filteredResults = useMemo(() => {
    const valid = results.filter(r => r !== null)
    switch (filter) {
      case 'found':     return valid.filter(r => r.found)
      case 'not_found': return valid.filter(r => !r.found && !r.error)
      case 'success':   return valid.filter(r => r.status === 'success')
      case 'failed':    return valid.filter(r => r.status === 'failed' || r.status === 'partial' || r.status === 'skipped')
      case 'errors':    return valid.filter(r => r.error && r.error !== 'Aborted')
      default:          return valid
    }
  }, [results, filter])

  const pageCount = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE))
  const pagedResults = useMemo(
    () => filteredResults.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredResults, page]
  )

  // Reset page when filter changes
  const handleFilterChange = (f) => {
    setFilter(f)
    setPage(0)
  }

  // ── Rate & ETA (during processing) ────────────────────────────────────────

  const { rate, eta } = useMemo(() => {
    const { completed, total, startTime } = progress
    if (!startTime || completed === 0) return { rate: 0, eta: null }
    const elapsed = (Date.now() - startTime) / 1000
    const r = completed / elapsed
    const remaining = (total - completed) / r * 1000
    return { rate: r, eta: remaining }
  }, [progress])

  // ── CSV export ────────────────────────────────────────────────────────────

  const exportCSV = useCallback(() => {
    const header = ['Hash', 'Found on Explorer', 'Status', 'Error']
    const rows = results.filter(r => r !== null).map(r => [
      r.hash,
      r.found ? 'Yes' : 'No',
      r.status ?? 'N/A',
      r.error ?? '',
    ])
    const csv = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ton-batch-lookup-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [results])

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderFoundBadge = (found, hasError) => {
    if (hasError) return <span className="badge badge-error">Error</span>
    return found
      ? <span className="badge badge-found">✓ Found</span>
      : <span className="badge badge-not-found">✗ Not Found</span>
  }

  const renderStatusBadge = (status, found) => {
    if (!found) return <span className="badge badge-na">—</span>
    switch (status) {
      case 'success': return <span className="badge badge-success">✓ Success</span>
      case 'failed':  return <span className="badge badge-failed">✗ Failed</span>
      case 'partial': return <span className="badge badge-partial">⚠ Partial Fail</span>
      case 'skipped': return <span className="badge badge-skipped">⚠ Skipped</span>
      case 'unknown': return <span className="badge badge-unknown">? Unknown</span>
      default:        return <span className="badge badge-na">—</span>
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0

  return (
    <div className="ton-batch-page">
      {/* ── Sidebar ── */}
      <nav className="page-sidebar">
        <div className="sidebar-header">
          <h3>Navigation</h3>
        </div>
        <div className="sidebar-links">
          <Link to="/" className={`sidebar-link ${location.pathname === '/' ? 'active' : ''}`}>
            <span className="sidebar-icon">🎮</span>
            <span className="sidebar-text">Game</span>
          </Link>
          <Link to="/broadcaster" className={`sidebar-link ${location.pathname === '/broadcaster' ? 'active' : ''}`}>
            <span className="sidebar-icon">🚀</span>
            <span className="sidebar-text">Broadcaster</span>
          </Link>
          <Link to="/simulator" className={`sidebar-link ${location.pathname === '/simulator' ? 'active' : ''}`}>
            <span className="sidebar-icon">⚡</span>
            <span className="sidebar-text">Simulator</span>
          </Link>
          <Link to="/ton-details" className={`sidebar-link ${location.pathname === '/ton-details' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔍</span>
            <span className="sidebar-text">Ton Details</span>
          </Link>
          <Link to="/ton-batch-lookup" className={`sidebar-link ${location.pathname === '/ton-batch-lookup' ? 'active' : ''}`}>
            <span className="sidebar-icon">📋</span>
            <span className="sidebar-text">TON Batch Lookup</span>
          </Link>
          <Link to="/btc-safe-to-fail" className={`sidebar-link ${location.pathname === '/btc-safe-to-fail' ? 'active' : ''}`}>
            <span className="sidebar-icon">₿</span>
            <span className="sidebar-text">BTC Safe-to-Fail</span>
          </Link>
        </div>
      </nav>

      {/* ── Main content ── */}
      <div className="ton-batch-container">

        {/* Header */}
        <div className="ton-batch-header">
          <h1>📋 TON Batch Lookup</h1>
          <p className="subtitle">
            Paste up to 500 000 transaction hashes — get on-chain presence and status for each
          </p>
        </div>

        {/* Input card */}
        <div className="card input-card">
          <div className="form-group">
            <div className="label-row">
              <label htmlFor="hash-input">Transaction hashes (64-hex, one per line or space-separated):</label>
              {hashCount > 0 && (
                <span className="hash-count-badge">
                  {hashCount.toLocaleString()} hash{hashCount !== 1 ? 'es' : ''} detected
                  {estimatedMs > 0 && (
                    <span className="time-estimate"> · est. {formatEta(estimatedMs)}</span>
                  )}
                </span>
              )}
            </div>
            <textarea
              id="hash-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={`4840d62b0cee043f7272fe4cba0d92faaa48d8e4ab1ddde1ac9d16e6931fc265\nabc123...\n...`}
              rows={8}
              disabled={processing}
              spellCheck={false}
            />
            <div className="form-hint">
              Invalid / non-hex-64 lines are silently skipped. Each hash is looked up as both a
              message hash and a transaction hash against the TON Center API.
            </div>
          </div>

          {/* Settings row */}
          <div className="settings-row">
            <div className="setting-group">
              <label>Concurrency</label>
              <div className="slider-row">
                <input
                  type="range"
                  min={1} max={20} step={1}
                  value={concurrency}
                  onChange={e => setConcurrency(Number(e.target.value))}
                  disabled={processing}
                />
                <span className="slider-value">{concurrency}</span>
              </div>
              <span className="setting-hint">parallel workers</span>
            </div>

            <div className="setting-group">
              <label>Request delay</label>
              <div className="slider-row">
                <input
                  type="range"
                  min={50} max={1000} step={50}
                  value={requestDelay}
                  onChange={e => setRequestDelay(Number(e.target.value))}
                  disabled={processing}
                />
                <span className="slider-value">{requestDelay} ms</span>
              </div>
              <span className="setting-hint">per API call (lower = faster, watch rate limits)</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="action-row">
            <button
              className="btn-primary"
              onClick={handleProcess}
              disabled={processing || hashCount === 0}
            >
              {processing ? 'Processing…' : `Process ${hashCount > 0 ? hashCount.toLocaleString() + ' hashes' : ''}`}
            </button>
            {processing && (
              <button className="btn-stop" onClick={handleStop}>
                ⛔ Stop
              </button>
            )}
          </div>
        </div>

        {/* Progress card */}
        {processing && (
          <div className="card progress-card">
            <div className="progress-header">
              <div className="progress-label">
                <span className="progress-title">Processing…</span>
                <span className="progress-counts">
                  {progress.completed.toLocaleString()} / {progress.total.toLocaleString()}
                </span>
              </div>
              <span className="progress-pct">{pct}%</span>
            </div>

            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${pct}%` }} />
            </div>

            <div className="progress-meta">
              <span>⚡ {formatRate(rate)}</span>
              <span>⏱ ETA {formatEta(eta)}</span>
              <span>✓ {stats.found.toLocaleString()} found</span>
              <span>✗ {stats.notFound.toLocaleString()} not found</span>
            </div>
          </div>
        )}

        {/* Results section */}
        {results.length > 0 && (
          <div className="results-section">

            {/* Summary stats */}
            <div className="stats-grid">
              <button
                className={`stat-card ${filter === 'all' ? 'active' : ''}`}
                onClick={() => handleFilterChange('all')}
              >
                <span className="stat-value">{stats.total.toLocaleString()}</span>
                <span className="stat-label">Total</span>
              </button>
              <button
                className={`stat-card stat-found ${filter === 'found' ? 'active' : ''}`}
                onClick={() => handleFilterChange('found')}
              >
                <span className="stat-value">{stats.found.toLocaleString()}</span>
                <span className="stat-label">Found on Chain</span>
              </button>
              <button
                className={`stat-card stat-not-found ${filter === 'not_found' ? 'active' : ''}`}
                onClick={() => handleFilterChange('not_found')}
              >
                <span className="stat-value">{stats.notFound.toLocaleString()}</span>
                <span className="stat-label">Not Found</span>
              </button>
              <button
                className={`stat-card stat-success ${filter === 'success' ? 'active' : ''}`}
                onClick={() => handleFilterChange('success')}
              >
                <span className="stat-value">{stats.success.toLocaleString()}</span>
                <span className="stat-label">Success</span>
              </button>
              <button
                className={`stat-card stat-failed ${filter === 'failed' ? 'active' : ''}`}
                onClick={() => handleFilterChange('failed')}
              >
                <span className="stat-value">{stats.failed.toLocaleString()}</span>
                <span className="stat-label">Failed</span>
              </button>
              {stats.partial > 0 && (
                <button
                  className={`stat-card stat-partial ${filter === 'failed' ? 'active' : ''}`}
                  onClick={() => handleFilterChange('failed')}
                >
                  <span className="stat-value">{stats.partial.toLocaleString()}</span>
                  <span className="stat-label">Partial Fail</span>
                </button>
              )}
              {stats.errors > 0 && (
                <button
                  className={`stat-card stat-errors ${filter === 'errors' ? 'active' : ''}`}
                  onClick={() => handleFilterChange('errors')}
                >
                  <span className="stat-value">{stats.errors.toLocaleString()}</span>
                  <span className="stat-label">API Errors</span>
                </button>
              )}
            </div>

            {/* Results table */}
            <div className="card table-card">
              <div className="table-toolbar">
                <span className="table-info">
                  Showing {filteredResults.length.toLocaleString()} result{filteredResults.length !== 1 ? 's' : ''}
                  {filter !== 'all' && <span className="filter-tag"> · filter: {filter.replace('_', ' ')}</span>}
                </span>
                <button className="btn-export" onClick={exportCSV} title="Export all results as CSV">
                  ⬇ Export CSV
                </button>
              </div>

              <div className="table-wrapper">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th className="col-num">#</th>
                      <th className="col-hash">Hash</th>
                      <th className="col-found">Found on Explorer</th>
                      <th className="col-status">Status on Chain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedResults.map((r, i) => {
                      const rowNum = page * PAGE_SIZE + i + 1
                      const tonscanUrl = `https://tonscan.org/tx/${r.hash}`
                      return (
                        <tr
                          key={r.hash}
                          className={`result-row ${r.found ? 'row-found' : ''} ${r.status === 'failed' ? 'row-failed' : ''}`}
                        >
                          <td className="col-num">{rowNum}</td>
                          <td className="col-hash">
                            <a
                              href={tonscanUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hash-link"
                              title={r.hash}
                            >
                              <span className="hash-short">{r.hash.slice(0, 16)}…{r.hash.slice(-8)}</span>
                              <span className="hash-full">{r.hash}</span>
                            </a>
                            {r.error && r.error !== 'Aborted' && (
                              <span className="error-tip" title={r.error}>⚠</span>
                            )}
                          </td>
                          <td className="col-found">
                            {renderFoundBadge(r.found, !!(r.error && r.error !== 'Aborted'))}
                          </td>
                          <td className="col-status">
                            {renderStatusBadge(r.status, r.found)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pageCount > 1 && (
                <div className="pagination">
                  <button
                    className="page-btn"
                    onClick={() => setPage(0)}
                    disabled={page === 0}
                  >
                    «
                  </button>
                  <button
                    className="page-btn"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    ‹
                  </button>

                  <span className="page-info">
                    Page {page + 1} of {pageCount.toLocaleString()}
                  </span>

                  <button
                    className="page-btn"
                    onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                    disabled={page >= pageCount - 1}
                  >
                    ›
                  </button>
                  <button
                    className="page-btn"
                    onClick={() => setPage(pageCount - 1)}
                    disabled={page >= pageCount - 1}
                  >
                    »
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TonBatchLookup
