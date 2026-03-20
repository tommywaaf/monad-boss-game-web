import { useState, useRef, useCallback, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { trackUsage } from '../utils/counter'
import './BtcFetcher.css'

const BLOCKCYPHER_TOKEN = import.meta.env.VITE_BLOCKCYPHER_TOKEN || ''
const HAS_TOKEN = BLOCKCYPHER_TOKEN.length > 0

const NETWORKS = [
  {
    id: 'btc',
    name: 'Bitcoin (BTC)',
    blockcypher: 'https://api.blockcypher.com/v1/btc/main',
    mempool: 'https://mempool.space/api',
    explorer: 'https://mempool.space/tx/',
    addressRegex: /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,90})$/,
    addressHint: 'Starts with 1, 3, or bc1',
  },
  {
    id: 'ltc',
    name: 'Litecoin (LTC)',
    blockcypher: 'https://api.blockcypher.com/v1/ltc/main',
    mempool: null,
    explorer: 'https://blockchair.com/litecoin/transaction/',
    addressRegex: /^(L[a-km-zA-HJ-NP-Z1-9]{25,34}|M[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|ltc1[a-zA-HJ-NP-Z0-9]{25,90})$/,
    addressHint: 'Starts with L, M, 3, or ltc1',
  },
]

const DELAY_MS = HAS_TOKEN ? 350 : 6000
const TXREF_LIMIT = 200

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

async function safeFetch(url, signal, timeoutMs = 20000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  if (signal) {
    signal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (res.status === 429) return { ok: false, rateLimited: true }
    if (!res.ok) return { ok: false, status: res.status }
    const data = await res.json()
    return { ok: true, data }
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') throw e
    return { ok: false, error: e.message }
  }
}

function getDirection(txref) {
  const isInput = txref.tx_input_n >= 0
  const isOutput = txref.tx_output_n >= 0
  if (isInput && isOutput) return 'both'
  if (isInput) return 'outgoing'
  if (isOutput) return 'incoming'
  return 'incoming'
}

async function fetchBlockCypherTxRefs(baseUrl, address, signal, onProgress, onLog) {
  const txMap = new Map()
  let beforeBlock = null
  let page = 1

  while (true) {
    let url = `${baseUrl}/addrs/${address}?limit=${TXREF_LIMIT}`
    if (HAS_TOKEN) url += `&token=${BLOCKCYPHER_TOKEN}`
    if (beforeBlock !== null) url += `&before=${beforeBlock}`

    onLog?.(`[BlockCypher] Page ${page}, fetching${beforeBlock ? ` before block ${beforeBlock}` : ''}...`)

    let retries = 5
    let result = null
    for (let attempt = 0; attempt < retries; attempt++) {
      result = await safeFetch(url, signal)
      if (result.ok) break
      if (result.rateLimited) {
        const wait = DELAY_MS * 2 + attempt * 2000
        onLog?.(`[BlockCypher] Rate limited, waiting ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${retries})...`)
        await sleep(wait, signal)
        continue
      }
      onLog?.(`[BlockCypher] Error (${result.status || result.error}), retry ${attempt + 1}/${retries}...`)
      await sleep(2000 + attempt * 1000, signal)
    }

    if (!result?.ok) {
      onLog?.(`[BlockCypher] Failed after ${retries} retries for ${address}`)
      break
    }

    const data = result.data
    const refs = [
      ...(data.txrefs || []),
      ...(data.unconfirmed_txrefs || []),
    ]

    if (refs.length === 0) {
      onLog?.(`[BlockCypher] Page ${page}: no txrefs — done`)
      break
    }

    for (const ref of refs) {
      const hash = (ref.tx_hash || '').toLowerCase()
      if (!hash) continue
      if (!txMap.has(hash)) {
        txMap.set(hash, {
          direction: getDirection(ref),
          blockHeight: ref.block_height || null,
          confirmed: ref.confirmed || null,
        })
      }
    }

    onLog?.(`[BlockCypher] Page ${page}: ${refs.length} refs, ${txMap.size} unique hashes`)
    onProgress?.({ page, found: txMap.size })

    if (!data.hasMore) break

    const lastBlock = refs[refs.length - 1]?.block_height
    if (lastBlock == null || lastBlock <= 0) break
    beforeBlock = lastBlock
    page++
    await sleep(DELAY_MS, signal)
  }

  return txMap
}

async function fetchMempoolTxs(baseUrl, address, signal, onProgress, onLog) {
  const txMap = new Map()
  let lastTxid = null
  let page = 1

  while (true) {
    const url = lastTxid
      ? `${baseUrl}/address/${address}/txs/chain/${lastTxid}`
      : `${baseUrl}/address/${address}/txs`

    onLog?.(`[mempool.space] Page ${page}...`)
    const result = await safeFetch(url, signal)

    if (!result.ok) {
      onLog?.(`[mempool.space] Error: ${result.status || result.error}`)
      break
    }

    const txs = result.data
    if (!Array.isArray(txs) || txs.length === 0) {
      onLog?.(`[mempool.space] Page ${page}: no more transactions`)
      break
    }

    for (const tx of txs) {
      const hash = (tx.txid || '').toLowerCase()
      if (!hash) continue
      if (txMap.has(hash)) continue

      const addrLower = address.toLowerCase()
      const isInput = (tx.vin || []).some(v =>
        v.prevout?.scriptpubkey_address?.toLowerCase() === addrLower
      )
      const isOutput = (tx.vout || []).some(v =>
        v.scriptpubkey_address?.toLowerCase() === addrLower
      )

      let direction = 'incoming'
      if (isInput && isOutput) direction = 'both'
      else if (isInput) direction = 'outgoing'

      txMap.set(hash, {
        direction,
        blockHeight: tx.status?.block_height || null,
        confirmed: tx.status?.confirmed ? tx.status.block_time : null,
      })
    }

    onLog?.(`[mempool.space] Page ${page}: ${txs.length} txs, ${txMap.size} unique`)
    onProgress?.({ page, found: txMap.size })

    if (txs.length < 25) break

    lastTxid = txs[txs.length - 1].txid
    page++
    await sleep(500, signal)
  }

  // Also grab mempool (unconfirmed)
  try {
    const mres = await safeFetch(`${baseUrl}/address/${address}/txs/mempool`, signal)
    if (mres.ok && Array.isArray(mres.data)) {
      for (const tx of mres.data) {
        const hash = (tx.txid || '').toLowerCase()
        if (!hash || txMap.has(hash)) continue
        txMap.set(hash, { direction: 'incoming', blockHeight: null, confirmed: null })
      }
      if (mres.data.length > 0) {
        onLog?.(`[mempool.space] ${mres.data.length} unconfirmed txs added`)
      }
    }
  } catch { /* ignore unconfirmed errors */ }

  return txMap
}

function parseAddresses(text) {
  return text
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

export default function BtcFetcher() {
  useEffect(() => {
    document.title = 'BTC Fetcher'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  const [network, setNetwork] = useState(NETWORKS[0])
  const [addressText, setAddressText] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [copyFeedback, setCopyFeedback] = useState('')
  const [logs, setLogs] = useState([])
  const [expandedAddrs, setExpandedAddrs] = useState(new Set())

  const abortRef = useRef(null)
  const logEndRef = useRef(null)
  const location = useLocation()

  const addresses = parseAddresses(addressText)
  const validAddresses = addresses.filter(a => network.addressRegex.test(a))
  const invalidCount = addresses.length - validAddresses.length
  const canFetch = validAddresses.length > 0 && !loading

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
    setResults([])
    setLogs([])
    setExpandedAddrs(new Set())
    setProgress({ addrIndex: 0, totalAddrs: validAddresses.length, page: 0, found: 0 })

    const allResults = []
    let totalHashes = 0

    try {
      addLog(`Starting BTC Fetcher on ${network.name}`)
      addLog(`${validAddresses.length} address${validAddresses.length > 1 ? 'es' : ''} to process`)
      addLog(HAS_TOKEN
        ? `BlockCypher token active — faster rate (~3 req/s)`
        : `No BlockCypher token — throttled (~1 req/6s). Set VITE_BLOCKCYPHER_TOKEN to speed up.`
      )

      for (let i = 0; i < validAddresses.length; i++) {
        const addr = validAddresses[i]
        addLog(`\n--- Address ${i + 1}/${validAddresses.length}: ${addr} ---`)
        setProgress({ addrIndex: i, totalAddrs: validAddresses.length, page: 0, found: 0 })

        let txMap = new Map()

        // Primary: BlockCypher
        addLog(`Fetching via BlockCypher...`)
        txMap = await fetchBlockCypherTxRefs(
          network.blockcypher,
          addr,
          signal,
          ({ page, found }) => {
            setProgress({ addrIndex: i, totalAddrs: validAddresses.length, page, found })
          },
          addLog
        )

        const bcCount = txMap.size
        addLog(`BlockCypher: ${bcCount} unique hashes`)

        // Fallback: mempool.space (BTC only)
        if (network.mempool) {
          addLog(`Cross-checking with mempool.space...`)
          await sleep(DELAY_MS, signal)

          const mempoolMap = await fetchMempoolTxs(
            network.mempool,
            addr,
            signal,
            ({ page, found }) => {
              setProgress({ addrIndex: i, totalAddrs: validAddresses.length, page, found: txMap.size + found })
            },
            addLog
          )

          let newFromMempool = 0
          for (const [hash, meta] of mempoolMap) {
            if (!txMap.has(hash)) {
              txMap.set(hash, meta)
              newFromMempool++
            }
          }
          if (newFromMempool > 0) {
            addLog(`mempool.space added ${newFromMempool} new hashes (${txMap.size} total)`)
          } else {
            addLog(`mempool.space: no additional hashes (${txMap.size} total)`)
          }
        }

        const sorted = [...txMap.entries()]
          .sort((a, b) => (b[1].blockHeight || 0) - (a[1].blockHeight || 0))

        allResults.push({ address: addr, hashes: sorted })
        totalHashes += sorted.length
        addLog(`Address ${i + 1} done: ${sorted.length} transaction hashes`)

        if (i < validAddresses.length - 1) {
          await sleep(DELAY_MS, signal)
        }
      }

      setResults(allResults)
      setProgress(null)
      setExpandedAddrs(new Set(allResults.map(r => r.address)))
      addLog(`\n=== Done! ${totalHashes} total hashes across ${allResults.length} address${allResults.length > 1 ? 'es' : ''} ===`)

      trackUsage('btcfetcher', totalHashes)
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
  }, [canFetch, validAddresses, network, addLog])

  const handleCancel = () => {
    abortRef.current?.abort()
  }

  const toggleAddress = (addr) => {
    setExpandedAddrs(prev => {
      const next = new Set(prev)
      if (next.has(addr)) next.delete(addr)
      else next.add(addr)
      return next
    })
  }

  const getAllHashes = () => results.flatMap(r => r.hashes.map(([h]) => h))

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(getAllHashes().join('\n'))
      setCopyFeedback('Copied!')
      setTimeout(() => setCopyFeedback(''), 2000)
    } catch {
      setCopyFeedback('Failed')
      setTimeout(() => setCopyFeedback(''), 2000)
    }
  }

  const handleCopyAddress = async (addr) => {
    const group = results.find(r => r.address === addr)
    if (!group) return
    try {
      await navigator.clipboard.writeText(group.hashes.map(([h]) => h).join('\n'))
      setCopyFeedback(`Copied ${group.hashes.length} hashes`)
      setTimeout(() => setCopyFeedback(''), 2000)
    } catch { /* ignore */ }
  }

  const handleCopyOne = async (hash) => {
    try {
      await navigator.clipboard.writeText(hash)
      setCopyFeedback(`Copied ${hash.slice(0, 10)}...`)
      setTimeout(() => setCopyFeedback(''), 1500)
    } catch { /* ignore */ }
  }

  const handleDownloadCSV = () => {
    const rows = results.flatMap(r =>
      r.hashes.map(([h, m]) =>
        `${r.address},${h},"${m.direction || ''}",${m.blockHeight || ''},${m.confirmed || ''}`
      )
    )
    const csv = 'address,txHash,direction,blockHeight,confirmed\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `btc_tx_hashes_${network.id}_${validAddresses.length}addrs.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalHashes = results.reduce((sum, r) => sum + r.hashes.length, 0)
  const progressPercent = progress
    ? Math.round((progress.addrIndex / progress.totalAddrs) * 100)
    : 0

  return (
    <div className="btcfetcher-page">
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

      <div className="btcfetcher-container">
        <header className="btcfetcher-header">
          <h1>BTC Fetcher</h1>
          <p>Fetch all transaction hashes for Bitcoin or Litecoin addresses.</p>
        </header>

        <section className="btcfetcher-section">
          <label className="btcfetcher-label">Network</label>
          <select
            className="btcfetcher-dropdown"
            value={network.id}
            onChange={(e) => {
              const net = NETWORKS.find(n => n.id === e.target.value)
              if (net) setNetwork(net)
            }}
          >
            {NETWORKS.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
          {HAS_TOKEN ? (
            <div className="btcfetcher-api-info api-ok">
              BlockCypher token active — faster rate (~3 requests/sec)
            </div>
          ) : (
            <div className="btcfetcher-api-info">
              No BlockCypher token — throttled to ~1 request per 6 seconds. Set VITE_BLOCKCYPHER_TOKEN to speed up.
            </div>
          )}
        </section>

        <section className="btcfetcher-section">
          <label className="btcfetcher-label">Addresses (one per line)</label>
          <textarea
            className="btcfetcher-textarea"
            placeholder={`Paste ${network.id.toUpperCase()} addresses here, one per line...\n${network.addressHint}`}
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            spellCheck={false}
          />
          {addresses.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <span className="address-count">
                {validAddresses.length} valid address{validAddresses.length !== 1 ? 'es' : ''}
              </span>
              {invalidCount > 0 && (
                <span className="address-count has-invalid">
                  {invalidCount} invalid — will be skipped
                </span>
              )}
            </div>
          )}
        </section>

        <section className="btcfetcher-fetch-section">
          <div className="btcfetcher-fetch-buttons">
            <button
              className="btcfetcher-fetch-btn"
              onClick={handleFetch}
              disabled={!canFetch}
            >
              {loading ? (
                <>
                  <span className="btcfetcher-spinner" />
                  Fetching...
                </>
              ) : (
                <>Fetch TX Hashes</>
              )}
            </button>
            {loading && (
              <button className="btcfetcher-cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
            )}
          </div>

          {progress && (
            <div className="btcfetcher-progress">
              <div className="btcfetcher-progress-status">
                Address <strong>{progress.addrIndex + 1}/{progress.totalAddrs}</strong>
                {progress.page > 0 && ` — page ${progress.page}`}
              </div>
              <div className="btcfetcher-progress-detail">
                {progress.found} hashes found for current address
              </div>
              <div className="btcfetcher-progress-bar-wrapper">
                <div
                  className="btcfetcher-progress-bar-fill"
                  style={{ width: `${Math.min(progressPercent, 95)}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {logs.length > 0 && (
          <section className="btcfetcher-section">
            <label className="btcfetcher-label">Activity Log</label>
            <div className="btcfetcher-activity-log">
              {logs.map((log, i) => (
                <div key={i} className={`btcfetcher-log-line${
                  log.includes('ERROR') ? ' log-error'
                  : log.includes('===') ? ' log-success'
                  : log.includes('Rate limited') ? ' log-warn'
                  : log.includes('--- Address') ? ' log-address'
                  : ''
                }`}>
                  {log}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </section>
        )}

        {error && (
          <div className="btcfetcher-error-box">{error}</div>
        )}

        {results.length > 0 && (
          <section className="btcfetcher-results-section">
            <div className="btcfetcher-summary-bar">
              <div className="btcfetcher-summary-stat">
                <span className="btcfetcher-summary-stat-label">Addresses</span>
                <span className="btcfetcher-summary-stat-value">{results.length}</span>
              </div>
              <div className="btcfetcher-summary-divider" />
              <div className="btcfetcher-summary-stat">
                <span className="btcfetcher-summary-stat-label">Total Hashes</span>
                <span className="btcfetcher-summary-stat-value">{totalHashes.toLocaleString()}</span>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <div className="btcfetcher-results-actions">
                  <button className="btcfetcher-copy-btn" onClick={handleCopyAll}>
                    {copyFeedback || `Copy All ${totalHashes.toLocaleString()}`}
                  </button>
                  <button className="btcfetcher-download-btn" onClick={handleDownloadCSV}>
                    Download CSV
                  </button>
                </div>
              </div>
            </div>

            {results.map((group) => {
              const isOpen = expandedAddrs.has(group.address)
              return (
                <div className="btcfetcher-address-group" key={group.address}>
                  <div
                    className="btcfetcher-address-group-header"
                    onClick={() => toggleAddress(group.address)}
                  >
                    <span className={`btcfetcher-address-group-toggle ${isOpen ? 'open' : ''}`}>
                      ▶
                    </span>
                    <span className="btcfetcher-address-group-addr">{group.address}</span>
                    <span className="btcfetcher-address-group-count">
                      {group.hashes.length.toLocaleString()} tx{group.hashes.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      className="btcfetcher-address-group-copy"
                      onClick={(e) => { e.stopPropagation(); handleCopyAddress(group.address) }}
                    >
                      Copy hashes
                    </button>
                  </div>

                  {isOpen && (
                    <div className="btcfetcher-hash-list">
                      {group.hashes.map(([hash, meta], i) => (
                        <div className="btcfetcher-hash-item" key={hash}>
                          <span className="btcfetcher-hash-index">{(i + 1).toLocaleString()}</span>
                          <a
                            className="btcfetcher-hash-value"
                            href={`${network.explorer}${hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {hash}
                          </a>
                          {meta.direction && (
                            <span className={`btcfetcher-hash-direction btcfetcher-dir-${meta.direction}`}>
                              {meta.direction}
                            </span>
                          )}
                          {meta.blockHeight && (
                            <span className="btcfetcher-hash-block">
                              #{meta.blockHeight.toLocaleString()}
                            </span>
                          )}
                          <button
                            className="btcfetcher-hash-copy-btn"
                            onClick={() => handleCopyOne(hash)}
                          >
                            Copy
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )}

        {!loading && !error && results.length === 0 && addresses.length === 0 && (
          <div className="btcfetcher-empty">
            <p>Paste addresses above and click Fetch to retrieve all transaction hashes.</p>
          </div>
        )}
      </div>
    </div>
  )
}
