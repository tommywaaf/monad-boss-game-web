import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { trackUsage } from '../utils/counter'
import './TonSeqnoCheck.css'

const TONCENTER = "https://toncenter.com"
const TX_PAGE_SIZE = 256

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getSession() {
  const apiKey = import.meta.env.VITE_TONCENTER_API_KEY
  const headers = { 'User-Agent': 'ton-seqno-check/1.0' }
  if (apiKey) headers['X-API-Key'] = apiKey
  return { headers }
}

function normB64(s) {
  s = s.trim().replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (s.length % 4)) % 4
  return s + '='.repeat(pad)
}

function b64ToHex(b64) {
  const normalized = normB64(b64)
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function fetchWithRetry(session, url, params, maxRetries = 4) {
  const queryString = new URLSearchParams(params).toString()
  const fullUrl = `${url}?${queryString}`

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await sleep(300 + Math.random() * 200)

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
      if (e.name === 'TimeoutError' && attempt < maxRetries) {
        await sleep(3000)
        continue
      }
      throw e
    }
  }

  throw new Error('Max retries exceeded')
}

async function fetchAbortable(session, url, params, signal, maxRetries = 6) {
  const queryString = new URLSearchParams(params).toString()
  const fullUrl = `${url}?${queryString}`

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    await sleep(300 + Math.random() * 200)

    try {
      const response = await fetch(fullUrl, {
        headers: session.headers,
        signal,
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
      if ((e.name === 'TimeoutError' || e.message?.includes('timeout')) && attempt < maxRetries) {
        await sleep(3000)
        continue
      }
      throw e
    }
  }

  throw new Error('Max retries exceeded')
}

// ── Seqno lookup ────────────────────────────────────────────────────────────

async function getWalletSeqno(address) {
  const session = getSession()

  const data = await fetchWithRetry(
    session,
    `${TONCENTER}/api/v2/getWalletInformation`,
    { address }
  )

  if (!data.ok) {
    throw new Error(data.error || 'API returned an error')
  }

  const result = data.result
  if (!result) throw new Error('No result in API response')

  if (!result.account_state || result.account_state === 'uninitialized') {
    return {
      address: result.address?.bounceable || address,
      rawAddress: result.address?.raw || null,
      status: result.account_state || 'uninitialized',
      nextSeqno: null,
      highestConfirmedSeqno: null,
      balance: result.balance || '0',
      walletType: result.wallet_type || null,
    }
  }

  const nextSeqno = result.seqno ?? null
  return {
    address: result.address?.bounceable || address,
    rawAddress: result.address?.raw || null,
    status: result.account_state || 'unknown',
    nextSeqno,
    highestConfirmedSeqno: nextSeqno !== null && nextSeqno > 0 ? nextSeqno - 1 : null,
    balance: result.balance || '0',
    walletType: result.wallet_type || null,
  }
}

// ── Transaction export ──────────────────────────────────────────────────────

async function fetchFbHashFromActions(session, traceId, signal) {
  const data = await fetchAbortable(
    session,
    `${TONCENTER}/api/v3/actions`,
    { trace_id: traceId, limit: 50, include_transactions: 'false' },
    signal,
  )
  const actions = data?.actions || []
  const te = actions.find(a => a.trace_external_hash)?.trace_external_hash
  return te ? b64ToHex(te) : null
}

async function exportTransactions({ address, direction, startDate, endDate, signal, onLog, onProgress }) {
  const session = getSession()
  const rows = []
  let offset = 0
  let page = 1
  let totalFetched = 0

  const params = {
    account: address,
    limit: String(TX_PAGE_SIZE),
    sort: 'asc',
  }
  if (startDate) {
    params.start_utime = String(Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000))
  }
  if (endDate) {
    params.end_utime = String(Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000))
  }

  const fbHashCache = new Map()
  const pendingIncoming = []

  onLog('Fetching transactions...')

  // Phase 1: fetch all transactions
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    onLog(`Page ${page} (offset ${offset})...`)
    const data = await fetchAbortable(
      session,
      `${TONCENTER}/api/v3/transactions`,
      { ...params, offset: String(offset) },
      signal,
    )

    const txs = data?.transactions || []
    if (txs.length === 0) {
      onLog(`Page ${page}: no more transactions`)
      break
    }

    for (const tx of txs) {
      const inMsg = tx.in_msg || {}
      const isOutgoing = !inMsg.source
      const dir = isOutgoing ? 'outgoing' : 'incoming'

      if (direction !== 'all' && dir !== direction) continue

      const timestamp = tx.now
      const date = timestamp ? new Date(timestamp * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : ''

      let fbHash = null
      let seqno = ''

      if (isOutgoing) {
        // For outgoing: in_msg.hash IS the trace_external_hash (external message hash)
        if (inMsg.hash) {
          fbHash = b64ToHex(inMsg.hash)
        }
        const decoded = inMsg.message_content?.decoded
        if (decoded?.msg_seqno != null) {
          seqno = String(decoded.msg_seqno)
        }
      } else {
        // For incoming: need to fetch trace_external_hash via actions API
        const traceId = tx.trace_id
        if (traceId && fbHashCache.has(traceId)) {
          fbHash = fbHashCache.get(traceId)
        } else if (traceId) {
          pendingIncoming.push({ idx: rows.length, traceId })
        }
      }

      rows.push({ date, fbHash, direction: dir, seqno })
    }

    totalFetched += txs.length
    onProgress({ phase: 'fetch', fetched: totalFetched, matched: rows.length, page })
    onLog(`Page ${page}: ${txs.length} txs fetched, ${rows.length} matched so far`)

    if (txs.length < TX_PAGE_SIZE) break
    offset += txs.length
    page++
  }

  // Phase 2: resolve FB hashes for incoming transactions that need action lookups
  if (pendingIncoming.length > 0) {
    const uniqueTraces = [...new Set(pendingIncoming.map(p => p.traceId))]
    onLog(`Resolving FB hashes for ${pendingIncoming.length} incoming txs (${uniqueTraces.length} unique traces)...`)

    let resolved = 0
    let failed = 0

    for (let i = 0; i < uniqueTraces.length; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

      const traceId = uniqueTraces[i]
      try {
        const hash = await fetchFbHashFromActions(session, traceId, signal)
        fbHashCache.set(traceId, hash)
        resolved++
      } catch (e) {
        if (e.name === 'AbortError') throw e
        fbHashCache.set(traceId, null)
        failed++
        onLog(`Failed to resolve trace ${traceId.slice(0, 16)}...: ${e.message}`)
      }

      if ((i + 1) % 10 === 0 || i === uniqueTraces.length - 1) {
        onProgress({ phase: 'resolve', resolved: i + 1, total: uniqueTraces.length, matched: rows.length })
        onLog(`Resolved ${i + 1}/${uniqueTraces.length} traces (${failed} failed)`)
      }
    }

    for (const { idx, traceId } of pendingIncoming) {
      rows[idx].fbHash = fbHashCache.get(traceId) || ''
    }
  }

  onLog(`Export complete: ${rows.length} transactions`)
  return rows
}

// ── Utilities ───────────────────────────────────────────────────────────────

function formatNano(nanoStr) {
  const n = BigInt(nanoStr)
  const whole = n / 1000000000n
  const frac = n % 1000000000n
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '')
  return fracStr ? `${whole}.${fracStr}` : `${whole}`
}

function CopyValue({ value, mono }) {
  const [copied, setCopied] = useState(false)

  const handleClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = String(value)
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }
  }, [value])

  return (
    <span
      className={`copy-value ${mono ? 'mono' : ''} ${copied ? 'copied' : ''}`}
      onClick={handleClick}
      title="Click to copy"
    >
      {value}
      {copied && <span className="copy-toast">Copied!</span>}
    </span>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

function TonSeqnoCheck() {
  const location = useLocation()

  useEffect(() => {
    document.title = 'TON Seqno Check'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  // Seqno check state
  const [input, setInput] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false)

  // Export state
  const [exportEnabled, setExportEnabled] = useState(false)
  const [exportDirection, setExportDirection] = useState('all')
  const [dateRangeEnabled, setDateRangeEnabled] = useState(false)
  const [exportStartDate, setExportStartDate] = useState('')
  const [exportEndDate, setExportEndDate] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(null)
  const [exportLogs, setExportLogs] = useState([])
  const [exportError, setExportError] = useState(null)
  const [exportRows, setExportRows] = useState(null)

  // Results table state
  const [searchQuery, setSearchQuery] = useState('')
  const [resultsPage, setResultsPage] = useState(0)
  const RESULTS_PAGE_SIZE = 100

  const abortRef = useRef(null)
  const logEndRef = useRef(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [exportLogs])

  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString()
    setExportLogs(prev => [...prev, `[${ts}] ${msg}`])
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const address = input.trim()
    if (!address) return

    trackUsage('ton-seqno', 1)
    setProcessing(true)
    setResult(null)
    setError(null)

    try {
      const data = await getWalletSeqno(address)
      setResult(data)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setProcessing(false)
    }
  }

  const handleExport = useCallback(async () => {
    const address = input.trim()
    if (!address) return

    trackUsage('ton-seqno-export', 1)

    const controller = new AbortController()
    abortRef.current = controller

    setExporting(true)
    setExportError(null)
    setExportLogs([])
    setExportProgress(null)
    setExportRows(null)
    setSearchQuery('')
    setResultsPage(0)

    try {
      const rows = await exportTransactions({
        address,
        direction: exportDirection,
        startDate: dateRangeEnabled ? (exportStartDate || null) : null,
        endDate: dateRangeEnabled ? (exportEndDate || null) : null,
        signal: controller.signal,
        onLog: addLog,
        onProgress: setExportProgress,
      })

      setExportRows(rows)
      addLog(`Done: ${rows.length} transactions ready`)
    } catch (e) {
      if (e.name === 'AbortError') {
        addLog('Export cancelled.')
      } else {
        addLog(`ERROR: ${e.message}`)
        setExportError(e.message)
      }
    } finally {
      setExporting(false)
      abortRef.current = null
      setExportProgress(null)
    }
  }, [input, exportDirection, dateRangeEnabled, exportStartDate, exportEndDate, addLog])

  const handleCancelExport = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const filteredExportRows = useMemo(() => {
    if (!exportRows) return []
    if (!searchQuery.trim()) return exportRows
    const q = searchQuery.trim().toLowerCase()
    return exportRows.filter(r =>
      (r.fbHash && r.fbHash.toLowerCase().includes(q)) ||
      r.date.toLowerCase().includes(q) ||
      r.direction.includes(q) ||
      r.seqno.includes(q)
    )
  }, [exportRows, searchQuery])

  const exportPageCount = Math.max(1, Math.ceil(filteredExportRows.length / RESULTS_PAGE_SIZE))
  const pagedExportRows = useMemo(
    () => filteredExportRows.slice(resultsPage * RESULTS_PAGE_SIZE, (resultsPage + 1) * RESULTS_PAGE_SIZE),
    [filteredExportRows, resultsPage]
  )

  const handleDownloadCsv = useCallback(() => {
    if (!exportRows || exportRows.length === 0) return
    const address = input.trim()
    const header = 'date,fbhash,direction,seqno'
    const csvRows = exportRows.map(r =>
      `"${r.date}","${r.fbHash || ''}","${r.direction}","${r.seqno}"`
    )
    const csv = [header, ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ton_txs_${address.slice(0, 12)}_${exportDirection}_${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [exportRows, input, exportDirection])

  return (
    <div className="ton-seqno-page">
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
          <Link to="/csv-builder" className={`sidebar-link ${location.pathname === '/csv-builder' ? 'active' : ''}`}>
            <span className="sidebar-icon">📊</span>
            <span className="sidebar-text">CSV Builder</span>
          </Link>
          <Link to="/faucet" className={`sidebar-link ${location.pathname === '/faucet' ? 'active' : ''}`}>
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
        </div>
      </nav>

      <div className="ton-seqno-container">
        <div className="ton-seqno-header">
          <h1>🔢 TON Seqno Check</h1>
          <p className="subtitle">Look up the highest confirmed sequence number (seqno) for a TON wallet address</p>
        </div>

        <form onSubmit={handleSubmit} className="ton-seqno-form">
          <div className="form-group">
            <label htmlFor="address-input">TON Wallet Address:</label>
            <input
              id="address-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="EQC... or UQC... or 0:abc123..."
              disabled={processing || exporting}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="form-hint">
              Accepts bounceable, non-bounceable, or raw (workchain:hex) address formats
            </div>
          </div>

          <button
            type="submit"
            className="submit-btn"
            disabled={processing || exporting || !input.trim()}
          >
            {processing ? 'Checking...' : 'Check Seqno'}
          </button>
        </form>

        {processing && (
          <div className="loading-container">
            <div className="spinner" />
            <span>Querying TON blockchain...</span>
          </div>
        )}

        {error && (
          <div className="result-card error">
            <div className="result-header">
              <h3>✗ Error</h3>
            </div>
            <div className="result-content">
              <div className="error-message">{error}</div>
            </div>
          </div>
        )}

        {result && (
          <div className="result-card success">
            <div className="result-header">
              <h3>✓ Wallet Info</h3>
            </div>
            <div className="result-content">
              <div className="result-field">
                <span className="field-label">Address (bounceable)</span>
                <span className="field-value"><CopyValue value={result.address} mono /></span>
              </div>
              {result.rawAddress && (
                <div className="result-field">
                  <span className="field-label">Raw Address</span>
                  <span className="field-value"><CopyValue value={result.rawAddress} mono /></span>
                </div>
              )}
              <div className="result-field">
                <span className="field-label">Account Status</span>
                <span className={`field-value status-badge status-${result.status}`}>
                  {result.status}
                </span>
              </div>
              {result.walletType && (
                <div className="result-field">
                  <span className="field-label">Wallet Type</span>
                  <span className="field-value">{result.walletType}</span>
                </div>
              )}
              <div className="seqno-highlight">
                <span className="seqno-label">Highest Confirmed Seqno</span>
                <span className="seqno-value">
                  {result.highestConfirmedSeqno !== null ? (
                    <CopyValue value={result.highestConfirmedSeqno} />
                  ) : (
                    <span className="seqno-na">N/A {result.nextSeqno === 0 ? '(no outgoing txs yet)' : '(wallet not initialized)'}</span>
                  )}
                </span>
              </div>
              <div className="result-field">
                <span className="field-label">Next Seqno (to use)</span>
                <span className="field-value">
                  {result.nextSeqno !== null ? result.nextSeqno : 'N/A'}
                </span>
              </div>
              <div className="result-field">
                <span className="field-label">Balance</span>
                <span className="field-value">{formatNano(result.balance)} TON</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Transaction Export ─────────────────────────────────────── */}

        <div className="export-section">
          <button
            className={`export-toggle ${exportEnabled ? 'active' : ''}`}
            onClick={() => setExportEnabled(v => !v)}
          >
            <span className="toggle-arrow">{exportEnabled ? '▼' : '▶'}</span>
            <span>Transaction Export (CSV)</span>
          </button>

          {exportEnabled && (
            <div className="export-panel">
              <div className="export-options">
                <div className="export-option-group">
                  <label className="export-label">Direction</label>
                  <div className="direction-options">
                    {['all', 'outgoing', 'incoming'].map(opt => (
                      <label key={opt} className={`direction-option ${exportDirection === opt ? 'active' : ''}`}>
                        <input
                          type="radio"
                          name="export-direction"
                          value={opt}
                          checked={exportDirection === opt}
                          onChange={() => setExportDirection(opt)}
                          disabled={exporting}
                        />
                        <span>
                          {opt === 'all' ? 'All' : opt === 'outgoing' ? 'Outgoing' : 'Incoming'}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="export-hint">
                    {exportDirection === 'outgoing' && 'Wallet-initiated transactions (seqno included in CSV)'}
                    {exportDirection === 'incoming' && 'Funds received — FB hash resolved via trace (slower)'}
                    {exportDirection === 'all' && 'Both incoming and outgoing transactions'}
                  </div>
                </div>

                <div className="export-option-group">
                  <button
                    className={`date-range-toggle ${dateRangeEnabled ? 'active' : ''}`}
                    onClick={() => setDateRangeEnabled(v => !v)}
                    disabled={exporting}
                  >
                    <span className="toggle-arrow">{dateRangeEnabled ? '▼' : '▶'}</span>
                    <span>Date Range Filter</span>
                    {!dateRangeEnabled && <span className="date-range-hint-inline">all time</span>}
                  </button>
                  {dateRangeEnabled && (
                    <div className="date-range-body">
                      <div className="date-inputs">
                        <div className="date-field">
                          <label>Start</label>
                          <input
                            type="date"
                            value={exportStartDate}
                            onChange={(e) => setExportStartDate(e.target.value)}
                            disabled={exporting}
                          />
                        </div>
                        <span className="date-separator">→</span>
                        <div className="date-field">
                          <label>End</label>
                          <input
                            type="date"
                            value={exportEndDate}
                            onChange={(e) => setExportEndDate(e.target.value)}
                            disabled={exporting}
                          />
                        </div>
                        {(exportStartDate || exportEndDate) && (
                          <button
                            className="date-clear"
                            onClick={() => { setExportStartDate(''); setExportEndDate('') }}
                            disabled={exporting}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="export-hint">
                        Both dates are inclusive (UTC). Leave empty for open-ended.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="export-actions">
                <button
                  className="export-btn"
                  onClick={handleExport}
                  disabled={exporting || !input.trim()}
                >
                  {exporting ? (
                    <>
                      <span className="spinner-sm" />
                      Exporting...
                    </>
                  ) : (
                    'Fetch Transactions'
                  )}
                </button>
                {exporting && (
                  <button className="cancel-export-btn" onClick={handleCancelExport}>
                    Cancel
                  </button>
                )}
              </div>

              {exportProgress && (
                <div className="export-progress">
                  {exportProgress.phase === 'fetch' && (
                    <span>Fetching page {exportProgress.page}... {exportProgress.matched.toLocaleString()} transactions matched</span>
                  )}
                  {exportProgress.phase === 'resolve' && (
                    <span>Resolving FB hashes: {exportProgress.resolved}/{exportProgress.total} traces ({exportProgress.matched.toLocaleString()} total txs)</span>
                  )}
                </div>
              )}

              {exportError && (
                <div className="export-error">{exportError}</div>
              )}

              {exportLogs.length > 0 && (
                <div className="export-log">
                  {exportLogs.map((log, i) => (
                    <div
                      key={i}
                      className={`log-line${log.includes('ERROR') ? ' log-error' : log.includes('Done:') || log.includes('complete') ? ' log-success' : ''}`}
                    >
                      {log}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              )}

              {!exporting && exportRows && exportRows.length > 0 && (
                <div className="export-results">
                  <div className="export-results-toolbar">
                    <div className="export-results-info">
                      <span className="summary-count">{exportRows.length.toLocaleString()} transactions</span>
                      <span className="summary-breakdown">
                        ({exportRows.filter(r => r.direction === 'outgoing').length} out, {exportRows.filter(r => r.direction === 'incoming').length} in)
                      </span>
                    </div>
                    <div className="export-results-actions">
                      <input
                        type="text"
                        className="results-search"
                        placeholder="Search hash, date, seqno..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setResultsPage(0) }}
                        spellCheck={false}
                      />
                      <button className="download-csv-btn" onClick={handleDownloadCsv}>
                        Download CSV
                      </button>
                    </div>
                  </div>

                  {searchQuery && filteredExportRows.length !== exportRows.length && (
                    <div className="search-match-info">
                      {filteredExportRows.length.toLocaleString()} match{filteredExportRows.length !== 1 ? 'es' : ''}
                    </div>
                  )}

                  <div className="export-table-wrap">
                    <table className="export-table">
                      <thead>
                        <tr>
                          <th className="col-num">#</th>
                          <th className="col-date">Date</th>
                          <th className="col-hash">FB Hash</th>
                          <th className="col-dir">Dir</th>
                          <th className="col-seq">Seqno</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedExportRows.map((r, i) => {
                          const rowNum = resultsPage * RESULTS_PAGE_SIZE + i + 1
                          return (
                            <tr key={i} className={`export-row dir-${r.direction}`}>
                              <td className="col-num">{rowNum}</td>
                              <td className="col-date">{r.date}</td>
                              <td className="col-hash">
                                {r.fbHash ? (
                                  <span className="hash-text" title={r.fbHash}>
                                    {r.fbHash.slice(0, 16)}…{r.fbHash.slice(-8)}
                                  </span>
                                ) : (
                                  <span className="hash-empty">—</span>
                                )}
                              </td>
                              <td className="col-dir">
                                <span className={`dir-badge dir-badge-${r.direction}`}>{r.direction}</span>
                              </td>
                              <td className="col-seq">{r.seqno || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {exportPageCount > 1 && (
                    <div className="export-pagination">
                      <button
                        className="page-btn"
                        onClick={() => setResultsPage(0)}
                        disabled={resultsPage === 0}
                      >
                        «
                      </button>
                      <button
                        className="page-btn"
                        onClick={() => setResultsPage(p => Math.max(0, p - 1))}
                        disabled={resultsPage === 0}
                      >
                        ‹
                      </button>
                      <span className="page-info">
                        Page {resultsPage + 1} of {exportPageCount.toLocaleString()}
                      </span>
                      <button
                        className="page-btn"
                        onClick={() => setResultsPage(p => Math.min(exportPageCount - 1, p + 1))}
                        disabled={resultsPage >= exportPageCount - 1}
                      >
                        ›
                      </button>
                      <button
                        className="page-btn"
                        onClick={() => setResultsPage(exportPageCount - 1)}
                        disabled={resultsPage >= exportPageCount - 1}
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!exporting && exportRows && exportRows.length === 0 && (
                <div className="export-summary">
                  No transactions found for the given filters.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TonSeqnoCheck
