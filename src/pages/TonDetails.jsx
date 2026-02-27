import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { trackUsage } from '../utils/counter'
import './TonDetails.css'

const TONCENTER = "https://toncenter.com"

// Calm mode knobs
const BASE_DELAY_BEFORE_EACH_REQUEST = 600 // milliseconds
const BACKOFF_BASE_SECONDS = 3.0
const MAX_RETRIES = 6

const TX_HEX_RE = /^[0-9a-fA-F]{64}$/

function extractTxHexFromUrl(url) {
  /**
   * Supports:
   *   - https://tonscan.org/tx/<64hex>               (often a message-hash-as-hex in your workflow)
   *   - https://tonviewer.com/transaction/<64hex>    (transaction hash)
   * Also accepts raw 64-hex as input.
   */
  url = url.trim()

  if (TX_HEX_RE.test(url)) {
    return url.toLowerCase()
  }

  try {
    const urlObj = new URL(url)
    const path = urlObj.pathname.trim().replace(/^\/|\/$/g, '')

    let m = path.match(/^tx\/([0-9a-fA-F]{64})$/)
    if (m) {
      return m[1].toLowerCase()
    }

    m = path.match(/^transaction\/([0-9a-fA-F]{64})$/)
    if (m) {
      return m[1].toLowerCase()
    }
  } catch (e) {
    // Invalid URL, will throw error below
  }

  throw new Error(
    "Unrecognized URL format. Expected:\n" +
    "  https://tonscan.org/tx/<64hex>\n" +
    "  https://tonviewer.com/transaction/<64hex>\n" +
    "  or a raw 64-hex string"
  )
}

function txHexToB64(txHex) {
  const hex = txHex.toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error("tx hex must be 64 hex characters")
  }
  
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  
  // Convert to base64
  const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('')
  return btoa(binary)
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

function getSession() {
  const apiKey = import.meta.env.VITE_TONCENTER_API_KEY
  const headers = {
    'User-Agent': 'ton-rescan-plan/1.1'
  }
  if (apiKey) {
    headers['X-API-Key'] = apiKey
  }
  return { headers }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randomUniform(min, max) {
  return Math.random() * (max - min) + min
}

async function getJsonCalm(session, url, params, timeout = 30000) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await sleep(BASE_DELAY_BEFORE_EACH_REQUEST + randomUniform(0, 250))

    const queryString = new URLSearchParams(params).toString()
    const fullUrl = `${url}?${queryString}`

    try {
      const response = await fetch(fullUrl, {
        headers: session.headers,
        signal: AbortSignal.timeout(timeout)
      })

      if (response.status === 200) {
        return await response.json()
      }

      if ([429, 500, 502, 503, 504].includes(response.status)) {
        let retryAfter = response.headers.get('Retry-After')
        let sleepS = BACKOFF_BASE_SECONDS * Math.pow(2, attempt - 1)
        
        if (retryAfter) {
          try {
            sleepS = parseFloat(retryAfter)
          } catch (e) {
            // Use exponential backoff
          }
        }

        sleepS += randomUniform(0, 0.75)
        console.log(`[calm retry] ${response.status} ${url} (attempt ${attempt}/${MAX_RETRIES}), sleeping ${sleepS.toFixed(1)}s`)
        await sleep(sleepS * 1000)
        continue
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    } catch (error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        if (attempt < MAX_RETRIES) {
          const sleepS = BACKOFF_BASE_SECONDS * Math.pow(2, attempt - 1) + randomUniform(0, 0.75)
          console.log(`[calm retry] timeout ${url} (attempt ${attempt}/${MAX_RETRIES}), sleeping ${sleepS.toFixed(1)}s`)
          await sleep(sleepS * 1000)
          continue
        }
      }
      throw error
    }
  }

  throw new Error(`Failed after ${MAX_RETRIES} calm retries: ${url}`)
}

async function getTxContextByEitherHash(session, hex64) {
  /**
   * Returns: { "tx": <transaction dict>, "mode": "message" | "transaction" }
   * 1) Try treating hex64 as a message hash (your tonscan flow).
   * 2) Fallback: treat hex64 as a transaction hash (tonviewer flow).
   */
  // Try message-hash flow
  const msgHashB64 = txHexToB64(hex64)
  const byMsg = await getJsonCalm(
    session,
    `${TONCENTER}/api/v3/transactionsByMessage`,
    { msg_hash: msgHashB64, limit: 10 }
  )
  
  const txs = byMsg.transactions || []
  if (txs.length > 0) {
    return { tx: txs[0], mode: "message" }
  }

  // Fallback: transaction-hash flow
  const byTx = await getJsonCalm(
    session,
    `${TONCENTER}/api/v3/transactions`,
    { hash: hex64, limit: 1 }
  )
  
  const txs2 = byTx.transactions || []
  if (txs2.length > 0) {
    return { tx: txs2[0], mode: "transaction" }
  }

  throw new Error("No transactions found (neither by msg_hash nor by tx hash).")
}

async function getTraceExternalHashHex(session, tx) {
  /**
   * Prefer tx.trace_external_hash if present; else use actions?trace_id.
   */
  const te = tx.trace_external_hash
  if (te) {
    return b64ToHex(te)
  }

  const traceId = tx.trace_id
  if (!traceId) {
    throw new Error("Transaction missing trace_id; cannot fetch actions.")
  }

  const actData = await getJsonCalm(
    session,
    `${TONCENTER}/api/v3/actions`,
    { trace_id: traceId, limit: 50, include_transactions: "false" }
  )
  
  const actions = actData.actions || []
  if (actions.length === 0) {
    throw new Error("No actions returned for trace_id")
  }

  const traceExternalB64 = actions.find(a => a.trace_external_hash)?.trace_external_hash
  if (!traceExternalB64) {
    throw new Error("trace_external_hash not found in actions")
  }

  return b64ToHex(traceExternalB64)
}

async function getMinRefMcSeqno(session, tx) {
  const blockRef = tx.block_ref
  if (!blockRef) {
    throw new Error("No block_ref on transaction")
  }

  const wc = parseInt(blockRef.workchain)
  const shard = String(blockRef.shard)
  const seqno = parseInt(blockRef.seqno)

  const blkData = await getJsonCalm(
    session,
    `${TONCENTER}/api/v3/blocks`,
    { workchain: wc, shard: shard, seqno: seqno, limit: 1 }
  )
  
  const blocks = blkData.blocks || []
  if (blocks.length === 0) {
    throw new Error("No blocks returned for block_ref")
  }

  const minRef = blocks[0].min_ref_mc_seqno
  if (minRef === null || minRef === undefined) {
    throw new Error("min_ref_mc_seqno missing from block response")
  }

  return parseInt(minRef)
}

async function rescanPlan(inputUrlOrHex) {
  const fbHashToRescan = extractTxHexFromUrl(inputUrlOrHex)
  const s = getSession()

  const ctx = await getTxContextByEitherHash(s, fbHashToRescan)
  const tx = ctx.tx
  const mode = ctx.mode

  const fbHashAfterRescan = await getTraceExternalHashHex(s, tx)

  const start = await getMinRefMcSeqno(s, tx)
  const end = start + 20

  return {
    mode: mode,
    fb_hash_to_rescan: fbHashToRescan,
    blocks_start: start,
    blocks_end: end,
    fb_hash_after_rescan: fbHashAfterRescan,
  }
}

function TonDetails() {
  const location = useLocation()
  const [input, setInput] = useState('')
  const [results, setResults] = useState([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const progressIntervalRef = useRef(null)

  // Fake progress animation over 8 seconds
  useEffect(() => {
    if (processing) {
      setProgress(0)
      const startTime = Date.now()
      const duration = 8000 // 8 seconds
      
      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const newProgress = Math.min((elapsed / duration) * 100, 100)
        setProgress(newProgress)
        
        if (newProgress >= 100) {
          clearInterval(progressIntervalRef.current)
        }
      }, 50) // Update every 50ms for smooth animation
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      setProgress(0)
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [processing])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const items = input.trim().split(/\s+/).filter(x => x.trim())
    trackUsage('ton', items.length)
    setProcessing(true)
    setResults([])
    setProgress(0)

    const newResults = []

    for (const item of items) {
      try {
        const res = await rescanPlan(item)
        newResults.push({
          input: item,
          success: true,
          data: res
        })
      } catch (error) {
        newResults.push({
          input: item,
          success: false,
          error: error.message || String(error)
        })
      }
    }

    // Jump to 100% if results arrive before 6 seconds
    setProgress(100)
    
    // Small delay to show 100% before hiding, then show results
    await new Promise(resolve => setTimeout(resolve, 200))
    
    setResults(newResults)
    setProcessing(false)
  }

  return (
    <div className="ton-details-page">
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

      <div className="ton-details-container">
        <div className="ton-details-header">
          <h1>🔍 Ton Details</h1>
          <p className="subtitle">Extract transaction details from Tonscan or Tonviewer URLs</p>
        </div>

        <form onSubmit={handleSubmit} className="ton-details-form">
          <div className="form-group">
            <label htmlFor="url-input">Paste tonscan/tonviewer tx URL(s):</label>
            <textarea
              id="url-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://tonscan.org/tx/... or https://tonviewer.com/transaction/... or raw 64-hex string"
              rows={4}
              disabled={processing}
            />
            <div className="form-hint">
              You can paste multiple URLs separated by spaces or newlines
            </div>
          </div>

          <button 
            type="submit" 
            className="submit-btn"
            disabled={processing || !input.trim()}
          >
            {processing ? 'Processing...' : 'Process'}
          </button>
        </form>

        {processing && (
          <div className="loading-container">
            <div className="loading-header">
              <h3>Processing transaction details...</h3>
              <div className="progress-text">{Math.round(progress)}%</div>
            </div>
            <div className="progress-bar-container">
              <div 
                className="progress-bar" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="loading-hint">
              Fetching data from TON Center API...
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="results-container">
            {results.map((result, idx) => (
              <div key={idx} className={`result-card ${result.success ? 'success' : 'error'}`}>
                <div className="result-header">
                  <h3>{result.success ? '✓ Success' : '✗ Error'}</h3>
                  <div className="result-input">
                    <strong>Input:</strong> {result.input}
                  </div>
                </div>

                {result.success ? (
                  <div className="result-content">
                    <div className="result-field">
                      <span className="field-label">Lookup mode:</span>
                      <span className="field-value">{result.data.mode}</span>
                    </div>
                    <div className="result-field">
                      <span className="field-label">FB Hash To rescan:</span>
                      <div className="field-value-wrapper">
                        <span className="field-value code">{result.data.fb_hash_to_rescan}</span>
                        <span className="field-hint">(use block to rescan)</span>
                      </div>
                    </div>
                    <div className="result-field">
                      <span className="field-label">Blocks to Rescan:</span>
                      <div className="field-value-wrapper">
                        <span className="field-value">{result.data.blocks_start} - {result.data.blocks_end}</span>
                        <span className="field-hint">use this!</span>
                      </div>
                    </div>
                    <div className="result-field">
                      <span className="field-label">FB Hash after rescan:</span>
                      <span className="field-value code">{result.data.fb_hash_after_rescan}</span>
                    </div>
                  </div>
                ) : (
                  <div className="result-content">
                    <div className="error-message">
                      <strong>ERROR:</strong> {result.error}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TonDetails
