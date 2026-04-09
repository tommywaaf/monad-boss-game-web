import { useState, useRef, useCallback, useEffect } from 'react'
import { trackUsage } from '../utils/counter'
import ToolInfoPanel from '../components/ToolInfoPanel'
import './TxFetcher.css'

const ETHERSCAN_API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY || ''
const HAS_API_KEY = ETHERSCAN_API_KEY.length > 0
const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api'
const CHAINLIST_URL = 'https://api.etherscan.io/v2/chainlist'
const DELAY_MS = HAS_API_KEY ? 250 : 5500
const UI_UPDATE_INTERVAL_MS = 200

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
  { id: '1', name: 'Ethereum Mainnet', chainId: 1, explorer: 'https://etherscan.io/tx/' },
  { id: '999', name: 'HyperEVM Mainnet', chainId: 999, explorer: 'https://hyperevmscan.io/tx/' },
  { id: '8453', name: 'Base Mainnet', chainId: 8453, explorer: 'https://basescan.org/tx/' },
  { id: '42161', name: 'Arbitrum One Mainnet', chainId: 42161, explorer: 'https://arbiscan.io/tx/' },
  { id: '137', name: 'Polygon Mainnet', chainId: 137, explorer: 'https://polygonscan.com/tx/' },
  { id: '10', name: 'OP Mainnet', chainId: 10, explorer: 'https://optimistic.etherscan.io/tx/' },
]

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

/** Normalize to 0x + 64 hex or null */
function normalizeTxHash(raw) {
  const s = String(raw).trim()
  if (!s) return null
  const with0x = s.startsWith('0x') || s.startsWith('0X') ? s : `0x${s}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(with0x)) return null
  return with0x.toLowerCase()
}

function tokenizeInput(text) {
  return text.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean)
}

function interpretTxByHashResponse(json) {
  if (json?.result === undefined) {
    return { definitive: false, kind: 'no_result' }
  }
  const r = json.result
  if (typeof r === 'string') {
    const lower = r.toLowerCase()
    if (lower.includes('rate limit') || lower.includes('max rate')) {
      return { definitive: false, kind: 'rate_limit' }
    }
    return {
      definitive: true,
      requestSuccess: true,
      onChain: false,
    }
  }
  if (r === null) {
    return { definitive: true, requestSuccess: true, onChain: false }
  }
  if (typeof r === 'object' && r !== null) {
    const h = r.hash
    const onChain = typeof h === 'string' && h.length > 0
    return { definitive: true, requestSuccess: true, onChain }
  }
  return { definitive: true, requestSuccess: true, onChain: false }
}

async function fetchTxByHashOnce(chainId, txHash, signal) {
  const fullParams = {
    chainid: String(chainId),
    module: 'proxy',
    action: 'eth_getTransactionByHash',
    txhash: txHash,
  }
  if (ETHERSCAN_API_KEY) fullParams.apikey = ETHERSCAN_API_KEY
  const url = `${ETHERSCAN_V2}?${new URLSearchParams(fullParams)}`
  const res = await fetch(url, { signal })
  const json = await res.json()
  return json
}

/**
 * Retries with exponential backoff until a definitive API interpretation or abort.
 * Does not include inter-hash pacing (caller adds DELAY_MS between hashes).
 */
async function lookupTxWithBackoff(chainId, txHash, signal, onTransient) {
  let attempt = 0
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      if (attempt > 0) {
        const backoff = Math.min(120000, 750 * Math.pow(2, Math.min(attempt - 1, 16)) + Math.random() * 400)
        onTransient?.(`transient response, backoff ${Math.round(backoff / 1000)}s (attempt ${attempt})`)
        await sleep(backoff, signal)
      }

      const json = await fetchTxByHashOnce(chainId, txHash, signal)
      const interp = interpretTxByHashResponse(json)

      if (!interp.definitive) {
        attempt++
        if (interp.kind === 'rate_limit' || interp.kind === 'no_result') {
          onTransient?.(interp.kind === 'rate_limit' ? 'rate limit in body, backing off...' : 'missing result field, retrying...')
        }
        continue
      }

      return {
        requestSuccess: interp.requestSuccess,
        onChain: interp.onChain,
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e
      attempt++
      const backoff = Math.min(120000, 1000 * Math.pow(2, Math.min(attempt - 1, 16)) + Math.random() * 500)
      onTransient?.(`request error: ${e.message} — retry in ${Math.round(backoff / 1000)}s`)
      await sleep(backoff, signal)
    }
  }
}

function escapeCsvField(val) {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export default function OnChainCheck() {
  useEffect(() => {
    document.title = 'Am I Onchain?'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  const [networks, setNetworks] = useState(FALLBACK_NETWORKS)
  const [selectedNetwork, setSelectedNetwork] = useState(FALLBACK_NETWORKS[0])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState([])
  const [logs, setLogs] = useState([])
  const [resultsPage, setResultsPage] = useState(0)
  const [pageSize, setPageSize] = useState(200)

  const abortRef = useRef(null)
  const resultsRef = useRef([])
  const progressRef = useRef({ done: 0, total: 0 })
  const logEndRef = useRef(null)

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
      .catch(() => { /* fallback */ })
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString()
    setLogs(prev => [...prev.slice(-400), `[${ts}] ${msg}`])
  }, [])

  useEffect(() => {
    let id
    if (loading) {
      id = setInterval(() => {
        setProgress({ ...progressRef.current })
        setResults([...resultsRef.current])
      }, UI_UPDATE_INTERVAL_MS)
    }
    return () => { if (id) clearInterval(id) }
  }, [loading])

  const parsedTokens = tokenizeInput(input)
  const validPreviewCount = parsedTokens.filter(t => normalizeTxHash(t)).length

  const handleRun = useCallback(async () => {
    const tokens = tokenizeInput(input)
    if (tokens.length === 0) return

    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller
    const chainId = selectedNetwork.chainId

    setLoading(true)
    setLogs([])
    setResultsPage(0)
    addLog(`Chain: ${selectedNetwork.name} (${chainId})`)
    addLog(HAS_API_KEY ? 'API key: fast pacing (~4 req/s)' : 'No API key — ~1 req / 5.5s (set VITE_ETHERSCAN_API_KEY to go faster)')

    const rows = tokens.map(raw => {
      const normalized = normalizeTxHash(raw)
      return { rawInput: raw.slice(0, 80), txHash: normalized }
    })

    resultsRef.current = rows.map(() => null)
    progressRef.current = { done: 0, total: rows.length }
    setResults([])
    setProgress({ done: 0, total: rows.length })

    let transientLogBudget = 80

    try {
      outer: for (let i = 0; i < rows.length; i++) {
        if (signal.aborted) break
        const { rawInput, txHash } = rows[i]

        try {
          if (!txHash) {
            resultsRef.current[i] = {
              rawInput,
              txHash: '',
              requestSuccess: false,
              onChain: false,
              note: 'Invalid tx hash (expected 0x + 64 hex)',
            }
          } else {
            if (i > 0) await sleep(DELAY_MS, signal)
            const data = await lookupTxWithBackoff(chainId, txHash, signal, (msg) => {
              if (transientLogBudget > 0) {
                transientLogBudget--
                addLog(`${txHash.slice(0, 10)}… ${msg}`)
              }
            })
            resultsRef.current[i] = {
              rawInput: '',
              txHash,
              requestSuccess: data.requestSuccess,
              onChain: data.onChain,
              note: '',
            }
          }
        } catch (e) {
          if (e.name === 'AbortError') {
            resultsRef.current[i] = {
              rawInput: txHash ? '' : rawInput,
              txHash: txHash || '',
              requestSuccess: false,
              onChain: false,
              note: 'Aborted',
            }
            addLog('Cancelled.')
            break outer
          }
          throw e
        }

        progressRef.current = { ...progressRef.current, done: i + 1 }
      }

      const final = resultsRef.current.map((r, idx) => r || {
        rawInput: rows[idx].rawInput,
        txHash: rows[idx].txHash || '',
        requestSuccess: false,
        onChain: false,
        note: signal.aborted ? 'Aborted' : 'Incomplete',
      })

      setResults(final)
      setProgress({ done: progressRef.current.total, total: progressRef.current.total })
      const stoppedEarly = signal.aborted || final.some(x => x.note === 'Aborted' || x.note === 'Incomplete')
      if (stoppedEarly) {
        addLog('Stopped — partial results below.')
      } else {
        addLog(`Done — ${final.length.toLocaleString()} rows.`)
        trackUsage('onchain-check', final.length)
      }
    } catch (e) {
      if (e.name !== 'AbortError') addLog(`ERROR: ${e.message}`)
      const final = resultsRef.current.map((r, idx) => r || {
        rawInput: rows[idx].rawInput,
        txHash: rows[idx].txHash || '',
        requestSuccess: false,
        onChain: false,
        note: signal.aborted ? 'Aborted' : 'Incomplete',
      })
      setResults(final)
      setProgress({ done: progressRef.current.total, total: progressRef.current.total })
      addLog('Error or interrupt — partial results below.')
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [input, selectedNetwork, addLog])

  const handleCancel = () => {
    abortRef.current?.abort()
  }

  const handleDownloadCSV = () => {
    const header = ['tx_hash', 'raw_input', 'request_success', 'on_chain', 'chain_id', 'chain_name', 'note']
    const lines = [header.join(',')]
    for (const r of results) {
      lines.push([
        escapeCsvField(r.txHash),
        escapeCsvField(r.rawInput),
        escapeCsvField(r.requestSuccess),
        escapeCsvField(r.onChain),
        escapeCsvField(selectedNetwork.chainId),
        escapeCsvField(selectedNetwork.name),
        escapeCsvField(r.note || ''),
      ].join(','))
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `onchain-check-chain${selectedNetwork.chainId}-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.max(1, Math.ceil(results.length / pageSize))
  const startIdx = resultsPage * pageSize
  const pageRows = results.slice(startIdx, startIdx + pageSize)
  const progressPct = progress.total > 0 ? Math.min(95, (progress.done / progress.total) * 100) : 0

  const canRun = !loading && parsedTokens.length > 0

  return (
    <div className="txfetcher-page">
      <div className="txfetcher-container">
        <header className="txfetcher-header">
          <h1>⛓️ Am I Onchain?</h1>
          <p>Paste EVM transaction hashes and check whether each exists on a chosen chain (Etherscan V2).</p>
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
            disabled={loading}
          >
            {networks.map(n => (
              <option key={n.id} value={n.id}>{n.name} ({n.chainId})</option>
            ))}
          </select>
          {HAS_API_KEY ? (
            <div className="api-info api-info-ok" style={{ marginTop: '0.75rem' }}>
              Etherscan V2 API key active — paced requests to stay under rate limits
            </div>
          ) : (
            <div className="api-info" style={{ marginTop: '0.75rem' }}>
              No API key — slow pacing (~1 req / 5.5s). Set VITE_ETHERSCAN_API_KEY for faster batches.
            </div>
          )}
        </section>

        <section className="txfetcher-section">
          <label className="txfetcher-label">Transaction hashes</label>
          <textarea
            className="txfetcher-input"
            style={{ minHeight: '140px', resize: 'vertical' }}
            placeholder="One hash per line, or space / comma separated — supports large batches (e.g. 5000+)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            disabled={loading}
          />
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#71717a' }}>
            {parsedTokens.length.toLocaleString()} token(s) — {validPreviewCount.toLocaleString()} valid 66-char hex hash(es)
          </div>
        </section>

        <section className="fetch-section">
          <div className="fetch-buttons">
            <button
              type="button"
              className="fetch-btn"
              onClick={handleRun}
              disabled={!canRun}
            >
              {loading ? (
                <>
                  <span className="fetch-spinner" />
                  Checking…
                </>
              ) : (
                <>Run check</>
              )}
            </button>
            {loading && (
              <button type="button" className="cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
            )}
          </div>

          {loading && progress.total > 0 && (
            <div className="progress-info" style={{ marginTop: '1rem' }}>
              <div className="progress-status">
                <strong>{progress.done.toLocaleString()}</strong> / {progress.total.toLocaleString()} hashes
              </div>
              <div className="progress-bar-wrapper">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {logs.length > 0 && (
          <section className="txfetcher-section">
            <label className="txfetcher-label">Activity log</label>
            <div className="activity-log">
              {logs.map((log, i) => (
                <div key={i} className={`log-line${log.includes('ERROR') ? ' log-error' : log.includes('Done') ? ' log-success' : ''}`}>
                  {log}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </section>
        )}

        {results.length > 0 && (
          <section className="results-section">
            <div className="results-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h3>Results</h3>
                <span className="results-count">{results.length.toLocaleString()} rows</span>
              </div>
              <div className="results-actions">
                <button type="button" className="download-btn" onClick={handleDownloadCSV}>
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
                Showing {(startIdx + 1).toLocaleString()}–{Math.min(startIdx + pageSize, results.length).toLocaleString()} of {results.length.toLocaleString()}
              </div>
            </div>

            <div className="hash-list" style={{ flexDirection: 'column', gap: 0 }}>
              <div
                className="hash-item"
                style={{
                  fontWeight: 700,
                  borderBottom: '1px solid rgba(255,255,255,0.12)',
                  paddingBottom: '0.5rem',
                  marginBottom: '0.25rem',
                }}
              >
                <span className="hash-index">#</span>
                <span style={{ flex: 1 }}>tx_hash</span>
                <span style={{ width: '7rem', textAlign: 'center' }}>request_success</span>
                <span style={{ width: '7rem', textAlign: 'center' }}>on_chain</span>
                <span style={{ flex: 0.6 }}>note</span>
              </div>
              {pageRows.map((r, i) => {
                const globalIdx = startIdx + i + 1
                const hash = r.txHash
                const explorer = hash ? `${selectedNetwork.explorer}${hash}` : null
                return (
                  <div className="hash-item" key={`${globalIdx}-${hash || r.rawInput}`} style={{ alignItems: 'flex-start' }}>
                    <span className="hash-index">{globalIdx.toLocaleString()}</span>
                    <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
                      {explorer ? (
                        <a className="hash-value" href={explorer} target="_blank" rel="noopener noreferrer">{hash}</a>
                      ) : (
                        <span className="hash-value" style={{ opacity: 0.85 }}>{r.rawInput || '—'}</span>
                      )}
                    </div>
                    <span style={{ width: '7rem', textAlign: 'center', color: r.requestSuccess ? '#4ade80' : '#f87171' }}>
                      {String(r.requestSuccess)}
                    </span>
                    <span style={{ width: '7rem', textAlign: 'center', color: r.onChain ? '#4ade80' : '#a1a1aa' }}>
                      {String(r.onChain)}
                    </span>
                    <span style={{ flex: 0.6, fontSize: '0.8rem', color: '#71717a' }}>{r.note || '—'}</span>
                  </div>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div className="results-pagination">
                <button type="button" className="pagination-btn" disabled={resultsPage === 0} onClick={() => setResultsPage(0)}>First</button>
                <button type="button" className="pagination-btn" disabled={resultsPage === 0} onClick={() => setResultsPage(p => p - 1)}>Prev</button>
                <span className="pagination-info">Page {resultsPage + 1} of {totalPages.toLocaleString()}</span>
                <button type="button" className="pagination-btn" disabled={resultsPage >= totalPages - 1} onClick={() => setResultsPage(p => p + 1)}>Next</button>
                <button type="button" className="pagination-btn" disabled={resultsPage >= totalPages - 1} onClick={() => setResultsPage(totalPages - 1)}>Last</button>
              </div>
            )}
          </section>
        )}
      </div>
      <ToolInfoPanel toolId="onchain-check" />
    </div>
  )
}
