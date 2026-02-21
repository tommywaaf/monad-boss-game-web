import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './BtcSafeToFail.css'

// ─── API endpoints ────────────────────────────────────────────────────────────
const BLOCKCYPHER   = 'https://api.blockcypher.com/v1/btc/main'
const BLOCKCHAIN_COM = 'https://blockchain.info'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TXID_RE = /^[0-9a-fA-F]{64}$/

function extractTxid(raw) {
  raw = raw.trim()
  if (TXID_RE.test(raw)) return raw.toLowerCase()
  try {
    const url = new URL(raw)
    const path = url.pathname.replace(/^\/+|\/+$/g, '')
    // mempool.space/tx/{txid}  |  blockchain.com/btc/tx/{txid}
    // blockcypher.com/btc/main/txs/{txid}  |  blockstream.info/tx/{txid}
    const m = path.match(/(?:btc\/)?txs?\/([0-9a-fA-F]{64})$/)
    if (m) return m[1].toLowerCase()
  } catch { /* not a URL */ }
  throw new Error(
    `Cannot extract a valid BTC txid from: "${raw.slice(0, 80)}"\n` +
    'Expected a 64-hex string or a URL from blockchain.com / blockcypher.com / mempool.space.'
  )
}

async function safeFetch(url, timeoutMs = 14000) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (resp.status === 200) {
      const data = await resp.json()
      return { ok: true, data }
    }
    if (resp.status === 404) return { ok: false, notFound: true }
    return { ok: false, httpStatus: resp.status }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

function isRbfSignaled(inputs = []) {
  return inputs.some(inp => {
    const seq = inp.sequence ?? inp.sequence_int
    return typeof seq === 'number' && seq < 0xFFFFFFFE
  })
}

function satsToBtc(sats) {
  if (sats == null) return null
  return (sats / 1e8).toFixed(8)
}

function fmtBtc(sats) {
  if (sats == null) return '?'
  return `${satsToBtc(sats)} BTC`
}

function fmtSats(sats) {
  if (sats == null) return ''
  return `(${sats.toLocaleString()} sats)`
}

function fmtTime(unixTs) {
  if (!unixTs) return null
  const d = new Date(unixTs * 1000)
  return d.toUTCString()
}

function shortHash(hash, chars = 10) {
  if (!hash) return '?'
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

// ─── Core analysis ────────────────────────────────────────────────────────────
async function analyzeTx(txid) {
  // Parallel-fetch both providers
  const [cyRes, bcRes] = await Promise.all([
    safeFetch(`${BLOCKCYPHER}/txs/${txid}?limit=50&includeHex=false`),
    safeFetch(`${BLOCKCHAIN_COM}/rawtx/${txid}?cors=true`),
  ])

  const cyData = cyRes.ok ? cyRes.data : null
  const bcData = bcRes.ok ? bcRes.data : null

  if (!cyData && !bcData) {
    return {
      status: 'NOT_FOUND',
      txid,
      providers: {
        blockcypher:   cyRes.notFound ? 'not found' : `error (${cyRes.error || cyRes.httpStatus})`,
        blockchainCom: bcRes.notFound ? 'not found' : `error (${bcRes.error || bcRes.httpStatus})`,
      },
    }
  }

  // ── Confirmation / block info ──
  const cyConfirms  = cyData?.confirmations ?? 0
  const cyHeight    = (cyData?.block_height > 0) ? cyData.block_height : null
  const bcHeight    = (bcData?.block_height > 0) ? bcData.block_height : null
  const blockHeight = cyHeight ?? bcHeight
  const confirmations = cyConfirms || (blockHeight ? 1 : 0)

  // ── Double-spend / RBF ──
  const doubleSpend  = cyData?.double_spend === true
  const replacedBy   = cyData?.double_spend_tx || null

  // ── Status ──
  let status = 'UNCONFIRMED'
  if (confirmations > 0 || blockHeight) status = 'CONFIRMED'
  if (doubleSpend) status = replacedBy ? 'REPLACED' : 'DOUBLE_SPENT'

  // ── Inputs ──
  // BlockCypher has prev_hash; blockchain.com only has internal tx_index
  let inputs = []
  if (cyData?.inputs?.length) {
    inputs = cyData.inputs.map((inp, i) => {
      const bcInp = bcData?.inputs?.[i]
      return {
        prevTxid:    inp.prev_hash   || null,
        outputIndex: inp.output_index ?? null,
        address:     inp.addresses?.[0] || bcInp?.prev_out?.addr || null,
        valueSats:   inp.output_value   ?? bcInp?.prev_out?.value ?? null,
        sequence:    inp.sequence       ?? bcInp?.sequence        ?? null,
        isCoinbase:  inp.prev_hash === '0000000000000000000000000000000000000000000000000000000000000000',
      }
    })
  } else if (bcData?.inputs?.length) {
    inputs = bcData.inputs.map(inp => ({
      prevTxid:    null,
      outputIndex: inp.prev_out?.n      ?? null,
      address:     inp.prev_out?.addr   || null,
      valueSats:   inp.prev_out?.value  ?? null,
      sequence:    inp.sequence         ?? null,
      isCoinbase:  false,
    }))
  }

  // ── Outputs ──
  // BlockCypher has spent_by txid; blockchain.com has boolean spent
  let outputs = []
  if (cyData?.outputs?.length) {
    outputs = cyData.outputs.map((out, i) => {
      const bcOut = bcData?.out?.[i]
      return {
        index:       i,
        address:     out.addresses?.[0] || bcOut?.addr  || null,
        valueSats:   out.value          ?? bcOut?.value ?? null,
        spent:       !!out.spent_by     || bcOut?.spent || false,
        spentByTxid: out.spent_by       || null,
        isOpReturn:  out.addresses == null && out.value === 0,
      }
    })
  } else if (bcData?.out?.length) {
    outputs = bcData.out.map((out, i) => ({
      index:       i,
      address:     out.addr    || null,
      valueSats:   out.value   ?? null,
      spent:       !!out.spent,
      spentByTxid: null,
      isOpReturn:  !out.addr && out.value === 0,
    }))
  }

  const feeSats  = cyData?.fees ?? bcData?.fee ?? null
  const totalIn  = inputs.reduce( (s, i) => s + (i.valueSats ?? 0), 0)
  const totalOut = outputs.reduce((s, o) => s + (o.valueSats ?? 0), 0)
  const rbf      = isRbfSignaled(inputs) || !!bcData?.rbf

  // ── If replaced, fetch replacing tx summary ──
  let replacingTx = null
  if (replacedBy) {
    const repRes = await safeFetch(`${BLOCKCYPHER}/txs/${replacedBy}?limit=50&includeHex=false`)
    if (repRes.ok) {
      const r = repRes.data
      replacingTx = {
        txid:          r.hash,
        confirmations: r.confirmations ?? 0,
        blockHeight:   r.block_height > 0 ? r.block_height : null,
        feeSats:       r.fees,
        inputs:        (r.inputs || []).map(inp => ({
          prevTxid:    inp.prev_hash,
          outputIndex: inp.output_index,
          address:     inp.addresses?.[0] || null,
          valueSats:   inp.output_value   ?? null,
        })),
        outputs: (r.outputs || []).map((out, i) => ({
          index:     i,
          address:   out.addresses?.[0] || null,
          valueSats: out.value          ?? null,
          spent:     !!out.spent_by,
        })),
      }
    }
  }

  return {
    status,
    txid,
    confirmations,
    blockHeight,
    doubleSpend,
    replacedBy,
    replacingTx,
    rbf,
    inputs,
    outputs,
    feeSats,
    totalIn,
    totalOut,
    timestamp: bcData?.time || null,
    size:      bcData?.size || cyData?.size  || null,
    vsize:     cyData?.vsize || null,
    weight:    cyData?.vsize ? cyData.vsize * 4 : null,
    providers: {
      blockcypher:   cyData ? 'ok' : (cyRes.notFound ? 'not found' : `error (${cyRes.error || cyRes.httpStatus})`),
      blockchainCom: bcData ? 'ok' : (bcRes.notFound ? 'not found' : `error (${bcRes.error || bcRes.httpStatus})`),
    },
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const config = {
    CONFIRMED:    { label: '✓ Confirmed',     cls: 'status-confirmed' },
    UNCONFIRMED:  { label: '⏳ Unconfirmed',   cls: 'status-unconfirmed' },
    REPLACED:     { label: '🔄 Replaced (RBF/Double-spend)', cls: 'status-replaced' },
    DOUBLE_SPENT: { label: '⚠ Double-spent',  cls: 'status-replaced' },
    NOT_FOUND:    { label: '✗ Not Found',     cls: 'status-notfound' },
  }
  const { label, cls } = config[status] || { label: status, cls: '' }
  return <span className={`status-badge ${cls}`}>{label}</span>
}

function HashCell({ hash, explorerBase }) {
  if (!hash) return <span className="muted">—</span>
  return (
    <span className="hash-cell">
      <a href={`${explorerBase}${hash}`} target="_blank" rel="noopener noreferrer"
         title={hash} className="hash-link">
        {shortHash(hash, 8)}
      </a>
      <button className="copy-btn" onClick={() => copyToClipboard(hash)} title="Copy full hash">⧉</button>
    </span>
  )
}

function InputsTable({ inputs }) {
  if (!inputs.length) return <p className="muted">No input data available.</p>
  return (
    <div className="utxo-table-wrap">
      <table className="utxo-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Prev TX (output index)</th>
            <th>Address</th>
            <th>Value</th>
            <th>Sequence</th>
            <th>RBF?</th>
          </tr>
        </thead>
        <tbody>
          {inputs.map((inp, i) => {
            const seqRbf = typeof inp.sequence === 'number' && inp.sequence < 0xFFFFFFFE
            return (
              <tr key={i} className={inp.isCoinbase ? 'coinbase-row' : ''}>
                <td className="idx-cell">{i}</td>
                <td className="hash-td">
                  {inp.isCoinbase ? (
                    <span className="tag-coinbase">COINBASE</span>
                  ) : inp.prevTxid ? (
                    <HashCell hash={inp.prevTxid} explorerBase="https://mempool.space/tx/" />
                  ) : (
                    <span className="muted">unknown</span>
                  )}
                  {inp.outputIndex != null && !inp.isCoinbase && (
                    <span className="output-index">:{inp.outputIndex}</span>
                  )}
                </td>
                <td className="addr-td">
                  {inp.address ? (
                    <a href={`https://mempool.space/address/${inp.address}`}
                       target="_blank" rel="noopener noreferrer"
                       className="addr-link" title={inp.address}>
                      {shortHash(inp.address, 7)}
                    </a>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="val-td">
                  {inp.valueSats != null ? (
                    <>
                      <span className="btc-val">{satsToBtc(inp.valueSats)}</span>
                      <span className="sats-hint">{inp.valueSats.toLocaleString()} sats</span>
                    </>
                  ) : <span className="muted">?</span>}
                </td>
                <td className="seq-td">
                  {inp.sequence != null
                    ? `0x${inp.sequence.toString(16).toUpperCase()}`
                    : <span className="muted">—</span>}
                </td>
                <td>
                  {seqRbf
                    ? <span className="tag-rbf">RBF</span>
                    : <span className="tag-final">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function OutputsTable({ outputs }) {
  if (!outputs.length) return <p className="muted">No output data available.</p>
  return (
    <div className="utxo-table-wrap">
      <table className="utxo-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Address</th>
            <th>Value</th>
            <th>Status</th>
            <th>Spent by TX</th>
          </tr>
        </thead>
        <tbody>
          {outputs.map((out) => (
            <tr key={out.index}>
              <td className="idx-cell">{out.index}</td>
              <td className="addr-td">
                {out.isOpReturn ? (
                  <span className="tag-opreturn">OP_RETURN</span>
                ) : out.address ? (
                  <a href={`https://mempool.space/address/${out.address}`}
                     target="_blank" rel="noopener noreferrer"
                     className="addr-link" title={out.address}>
                    {shortHash(out.address, 7)}
                  </a>
                ) : <span className="muted">—</span>}
              </td>
              <td className="val-td">
                {out.valueSats != null ? (
                  <>
                    <span className="btc-val">{satsToBtc(out.valueSats)}</span>
                    <span className="sats-hint">{out.valueSats.toLocaleString()} sats</span>
                  </>
                ) : <span className="muted">?</span>}
              </td>
              <td>
                {out.spent
                  ? <span className="tag-spent">Spent</span>
                  : <span className="tag-unspent">Unspent (UTXO)</span>}
              </td>
              <td className="hash-td">
                {out.spentByTxid
                  ? <HashCell hash={out.spentByTxid} explorerBase="https://mempool.space/tx/" />
                  : <span className="muted">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TxResultCard({ result }) {
  const [tab, setTab] = useState('inputs')

  if (!result.success) {
    return (
      <div className="btc-result-card error">
        <div className="btc-result-header">
          <span className="status-badge status-error">✗ Error</span>
          <span className="result-input-label" title={result.input}>{result.input.slice(0, 80)}</span>
        </div>
        <div className="error-msg">{result.error}</div>
      </div>
    )
  }

  const d = result.data

  if (d.status === 'NOT_FOUND') {
    return (
      <div className="btc-result-card not-found">
        <div className="btc-result-header">
          <StatusBadge status="NOT_FOUND" />
          <span className="result-input-label mono" title={d.txid}>{shortHash(d.txid, 14)}</span>
        </div>
        <p className="muted" style={{ margin: '0.5rem 0 0' }}>
          Transaction not found on either provider.
          It may not yet be broadcast, or it may have been evicted from the mempool.
        </p>
        <div className="provider-row">
          <span>BlockCypher: <b>{d.providers.blockcypher}</b></span>
          <span>Blockchain.com: <b>{d.providers.blockchainCom}</b></span>
        </div>
      </div>
    )
  }

  const mempoolLink   = `https://mempool.space/tx/${d.txid}`
  const bcLink        = `https://www.blockchain.com/btc/tx/${d.txid}`
  const blockcyLink   = `https://live.blockcypher.com/btc/tx/${d.txid}`

  return (
    <div className={`btc-result-card ${d.status.toLowerCase()}`}>
      {/* ── Header ── */}
      <div className="btc-result-header">
        <StatusBadge status={d.status} />
        {d.rbf && d.status !== 'CONFIRMED' && (
          <span className="status-badge status-rbf">⚡ RBF Opted-in</span>
        )}
        <span className="result-input-label mono" title={d.txid}>
          {shortHash(d.txid, 14)}
        </span>
        <button className="copy-btn inline" onClick={() => copyToClipboard(d.txid)} title="Copy txid">⧉ Copy txid</button>
      </div>

      {/* ── Replacement warning ── */}
      {(d.status === 'REPLACED' || d.status === 'DOUBLE_SPENT') && (
        <div className="replacement-banner">
          <div className="replacement-title">🔄 This transaction was replaced / double-spent</div>
          {d.replacedBy ? (
            <div className="replacement-by">
              Replaced by:{' '}
              <a href={`https://mempool.space/tx/${d.replacedBy}`} target="_blank" rel="noopener noreferrer"
                 className="hash-link mono">{d.replacedBy}</a>
              <button className="copy-btn" onClick={() => copyToClipboard(d.replacedBy)} title="Copy">⧉</button>
            </div>
          ) : (
            <p className="muted">Replacing txid not available from provider.</p>
          )}
        </div>
      )}

      {/* ── Key stats grid ── */}
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Confirmations</span>
          <span className="stat-value">{d.confirmations.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Block Height</span>
          <span className="stat-value">{d.blockHeight?.toLocaleString() ?? '—'}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Fee</span>
          <span className="stat-value">{fmtBtc(d.feeSats)} <span className="muted small">{fmtSats(d.feeSats)}</span></span>
        </div>
        {d.vsize && (
          <div className="stat-item">
            <span className="stat-label">vSize / Size</span>
            <span className="stat-value">{d.vsize} vB {d.size ? `/ ${d.size} B` : ''}</span>
          </div>
        )}
        {!d.vsize && d.size && (
          <div className="stat-item">
            <span className="stat-label">Size</span>
            <span className="stat-value">{d.size} bytes</span>
          </div>
        )}
        <div className="stat-item">
          <span className="stat-label">Timestamp</span>
          <span className="stat-value small">{fmtTime(d.timestamp) ?? (d.status === 'UNCONFIRMED' ? 'Unconfirmed' : '—')}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total In</span>
          <span className="stat-value">{fmtBtc(d.totalIn)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Out</span>
          <span className="stat-value">{fmtBtc(d.totalOut)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Inputs / Outputs</span>
          <span className="stat-value">{d.inputs.length} / {d.outputs.length}</span>
        </div>
      </div>

      {/* ── UTXO tabs ── */}
      <div className="utxo-section">
        <div className="tab-bar">
          <button className={`tab-btn ${tab === 'inputs' ? 'active' : ''}`}  onClick={() => setTab('inputs')}>
            Spent UTXOs (Inputs) <span className="tab-count">{d.inputs.length}</span>
          </button>
          <button className={`tab-btn ${tab === 'outputs' ? 'active' : ''}`} onClick={() => setTab('outputs')}>
            New UTXOs (Outputs) <span className="tab-count">{d.outputs.length}</span>
          </button>
          {d.replacingTx && (
            <button className={`tab-btn tab-replacing ${tab === 'replacing' ? 'active' : ''}`} onClick={() => setTab('replacing')}>
              Replacing TX Outputs <span className="tab-count">{d.replacingTx.outputs.length}</span>
            </button>
          )}
        </div>
        <div className="tab-content">
          {tab === 'inputs'  && <InputsTable  inputs={d.inputs} />}
          {tab === 'outputs' && <OutputsTable outputs={d.outputs} />}
          {tab === 'replacing' && d.replacingTx && (
            <div>
              <div className="replacing-tx-info">
                <span className="stat-label">Replacing txid:</span>{' '}
                <a href={`https://mempool.space/tx/${d.replacingTx.txid}`} target="_blank" rel="noopener noreferrer"
                   className="hash-link mono">{d.replacingTx.txid}</a>
                <span className="muted" style={{ marginLeft: '1rem' }}>
                  {d.replacingTx.confirmations > 0
                    ? `${d.replacingTx.confirmations.toLocaleString()} confirmations @ block ${d.replacingTx.blockHeight}`
                    : 'Unconfirmed'}
                </span>
              </div>
              <h4 style={{ color: '#f97316', margin: '1rem 0 0.5rem' }}>Replacing TX Outputs</h4>
              <OutputsTable outputs={d.replacingTx.outputs} />
              <h4 style={{ color: '#f97316', margin: '1rem 0 0.5rem' }}>Replacing TX Inputs</h4>
              <InputsTable inputs={d.replacingTx.inputs} />
            </div>
          )}
        </div>
      </div>

      {/* ── Explorer links ── */}
      <div className="explorer-links">
        <span className="explorer-label">View on:</span>
        <a href={mempoolLink} target="_blank" rel="noopener noreferrer" className="explorer-btn">
          🔗 mempool.space
        </a>
        <a href={bcLink} target="_blank" rel="noopener noreferrer" className="explorer-btn">
          🔗 blockchain.com
        </a>
        <a href={blockcyLink} target="_blank" rel="noopener noreferrer" className="explorer-btn">
          🔗 BlockCypher
        </a>
      </div>

      {/* ── Provider status ── */}
      <div className="provider-row">
        <span>BlockCypher: <b className={d.providers.blockcypher === 'ok' ? 'ok' : 'fail'}>{d.providers.blockcypher}</b></span>
        <span>Blockchain.com: <b className={d.providers.blockchainCom === 'ok' ? 'ok' : 'fail'}>{d.providers.blockchainCom}</b></span>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
function BtcSafeToFail() {
  const location    = useLocation()
  const [input,      setInput]      = useState('')
  const [results,    setResults]    = useState([])
  const [processing, setProcessing] = useState(false)
  const [progress,   setProgress]   = useState(0)
  const [statusMsg,  setStatusMsg]  = useState('')
  const progressRef  = useRef(null)

  useEffect(() => {
    if (processing) {
      setProgress(0)
      const start    = Date.now()
      const duration = 12000
      progressRef.current = setInterval(() => {
        const pct = Math.min(((Date.now() - start) / duration) * 92, 92)
        setProgress(pct)
      }, 50)
    } else {
      clearInterval(progressRef.current)
      progressRef.current = null
    }
    return () => clearInterval(progressRef.current)
  }, [processing])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const items = input.trim().split(/[\s,\n]+/).filter(x => x.trim())
    setProcessing(true)
    setResults([])

    const newResults = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      setStatusMsg(`Analyzing ${i + 1} / ${items.length}: ${item.slice(0, 30)}…`)
      try {
        const txid  = extractTxid(item)
        const data  = await analyzeTx(txid)
        newResults.push({ input: item, success: true, data })
      } catch (err) {
        newResults.push({ input: item, success: false, error: err.message })
      }
    }

    setProgress(100)
    setStatusMsg('Done')
    await new Promise(r => setTimeout(r, 200))
    setResults(newResults)
    setProcessing(false)
    setStatusMsg('')
  }

  return (
    <div className="btc-page">
      {/* ── Sidebar ── */}
      <nav className="page-sidebar">
        <div className="sidebar-header"><h3>Navigation</h3></div>
        <div className="sidebar-links">
          <Link to="/"
            className={`sidebar-link ${['/', ''].includes(location.pathname) ? 'active' : ''}`}>
            <span className="sidebar-icon">🎮</span>
            <span className="sidebar-text">Game</span>
          </Link>
          <Link to="/broadcaster"
            className={`sidebar-link ${location.pathname === '/broadcaster' ? 'active' : ''}`}>
            <span className="sidebar-icon">🚀</span>
            <span className="sidebar-text">Broadcaster</span>
          </Link>
          <Link to="/simulator"
            className={`sidebar-link ${location.pathname === '/simulator' ? 'active' : ''}`}>
            <span className="sidebar-icon">⚡</span>
            <span className="sidebar-text">Simulator</span>
          </Link>
          <Link to="/ton-details"
            className={`sidebar-link ${location.pathname === '/ton-details' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔍</span>
            <span className="sidebar-text">Ton Details</span>
          </Link>
          <Link to="/btc-safe-to-fail"
            className={`sidebar-link ${location.pathname === '/btc-safe-to-fail' ? 'active' : ''}`}>
            <span className="sidebar-icon">₿</span>
            <span className="sidebar-text">BTC Safe-to-Fail</span>
          </Link>
        </div>
      </nav>

      {/* ── Main container ── */}
      <div className="btc-container">
        <div className="btc-header">
          <h1>₿ BTC Safe-to-Fail Checker</h1>
          <p className="subtitle">
            Lookup any Bitcoin transaction — check confirmation status, detect RBF replacement&nbsp;/&nbsp;double-spends,
            and inspect spent &amp; new UTXOs side-by-side from two independent providers.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="btc-form">
          <div className="form-group">
            <label htmlFor="txid-input">BTC Transaction ID(s) or explorer URL(s)</label>
            <textarea
              id="txid-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                'e.g. 4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b\n' +
                'or  https://mempool.space/tx/<txid>\n' +
                'Paste multiple txids on separate lines.'
              }
              rows={4}
              disabled={processing}
            />
            <div className="form-hint">
              Supports raw 64-hex txids and URLs from mempool.space, blockchain.com, blockcypher.com, or blockstream.info.
              Multiple entries separated by newlines are processed sequentially.
            </div>
          </div>
          <button type="submit" className="submit-btn" disabled={processing || !input.trim()}>
            {processing ? '⏳ Analyzing…' : '🔍 Analyze Transaction(s)'}
          </button>
        </form>

        {/* ── Progress ── */}
        {processing && (
          <div className="loading-container">
            <div className="loading-header">
              <h3>Querying providers…</h3>
              <span className="progress-text">{Math.round(progress)}%</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="loading-hint">{statusMsg || 'Fetching from Blockchain.com + BlockCypher…'}</div>
          </div>
        )}

        {/* ── Results ── */}
        {results.length > 0 && (
          <div className="btc-results">
            {results.map((r, i) => <TxResultCard key={i} result={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}

export default BtcSafeToFail
