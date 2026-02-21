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

function shortHash(hash, chars = 10) {
  if (!hash) return '?'
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

// ─── Address balance fetch ────────────────────────────────────────────────────
// Returns { addr, finalBalance (sats), confirmedBalance, unconfirmedBalance,
//           totalReceived, totalSent, nTx, source, error }
async function fetchAddressBalance(addr) {
  // Primary: BlockCypher /addrs/{addr}/balance  (clean JSON, good CORS)
  const cyRes = await safeFetch(`${BLOCKCYPHER}/addrs/${addr}/balance`)
  if (cyRes.ok) {
    const d = cyRes.data
    return {
      addr,
      finalBalance:       d.final_balance      ?? d.balance ?? null,
      confirmedBalance:   d.balance             ?? null,
      unconfirmedBalance: d.unconfirmed_balance ?? 0,
      totalReceived:      d.total_received      ?? null,
      totalSent:          d.total_sent          ?? null,
      nTx:                d.n_tx               ?? null,
      source: 'BlockCypher',
      error:  false,
    }
  }

  // Fallback: Blockchain.com /balance?active={addr}&cors=true
  const bcRes = await safeFetch(`${BLOCKCHAIN_COM}/balance?active=${addr}&cors=true`)
  if (bcRes.ok && bcRes.data?.[addr]) {
    const d = bcRes.data[addr]
    return {
      addr,
      finalBalance:       d.final_balance  ?? null,
      confirmedBalance:   d.final_balance  ?? null,
      unconfirmedBalance: 0,
      totalReceived:      d.total_received ?? null,
      totalSent:          d.total_sent     ?? null,
      nTx:                d.n_tx          ?? null,
      source: 'Blockchain.com',
      error:  false,
    }
  }

  return { addr, finalBalance: null, error: true, source: null }
}

// ─── Core analysis ────────────────────────────────────────────────────────────
async function analyzeTx(txid) {
  // Parallel-fetch all three providers
  // mempool.space is the key addition: it gives prevTxid for every input AND
  // exposes the /outspend endpoint we use to detect UTXO-level replacements.
  const [cyRes, bcRes, msRes] = await Promise.all([
    safeFetch(`${BLOCKCYPHER}/txs/${txid}?limit=50&includeHex=false`),
    safeFetch(`${BLOCKCHAIN_COM}/rawtx/${txid}?cors=true`),
    safeFetch(`https://mempool.space/api/tx/${txid}`),
  ])

  const cyData = cyRes.ok ? cyRes.data : null
  const bcData = bcRes.ok ? bcRes.data : null
  const msData = msRes.ok ? msRes.data : null

  if (!cyData && !bcData && !msData) {
    return {
      status: 'NOT_FOUND',
      txid,
      providers: {
        blockcypher:   cyRes.notFound ? 'not found' : `error (${cyRes.error || cyRes.httpStatus})`,
        blockchainCom: bcRes.notFound ? 'not found' : `error (${bcRes.error || bcRes.httpStatus})`,
        mempoolSpace:  msRes.notFound ? 'not found' : `error (${msRes.error || msRes.httpStatus})`,
      },
    }
  }

  // ── Confirmation / block info ──
  const msConfirmed   = msData?.status?.confirmed === true
  const msHeight      = msData?.status?.block_height  || null
  const msTime        = msData?.status?.block_time    || null
  const cyConfirms    = cyData?.confirmations ?? 0
  const cyHeight      = (cyData?.block_height > 0) ? cyData.block_height : null
  const bcHeight      = (bcData?.block_height > 0) ? bcData.block_height : null
  const blockHeight   = cyHeight ?? msHeight ?? bcHeight
  const confirmations = cyConfirms || (blockHeight ? 1 : 0)

  // ── Confirmed by ANY provider? This is the absolute highest-priority signal.
  // A confirmation on-chain beats everything — BlockCypher double_spend flags,
  // UTXO outspend checks, everything. Once confirmed, always green.
  const confirmedByAnyProvider =
    cyConfirms > 0 || !!cyHeight || !!bcHeight || msConfirmed

  // ── Double-spend detection (BlockCypher) ──
  const doubleSpend = cyData?.double_spend === true
  let   replacedBy  = cyData?.double_spend_tx || null

  // ── Status — confirmation wins over double-spend flags ──
  let status = 'UNCONFIRMED'
  if (confirmedByAnyProvider) {
    status = 'CONFIRMED'
  } else if (doubleSpend) {
    // Only apply BlockCypher's double_spend flag when not confirmed by any provider
    status = replacedBy ? 'REPLACED' : 'DOUBLE_SPENT'
  }

  // ── Inputs ──
  // Priority for prevTxid: BlockCypher → mempool.space → (blockchain.com has none)
  // Priority for address/value: BlockCypher → mempool.space prevout → blockchain.com
  let inputs = []
  const maxLen = Math.max(
    cyData?.inputs?.length ?? 0,
    msData?.vin?.length    ?? 0,
    bcData?.inputs?.length ?? 0,
  )
  for (let i = 0; i < maxLen; i++) {
    const cy  = cyData?.inputs?.[i]
    const ms  = msData?.vin?.[i]
    const bc  = bcData?.inputs?.[i]
    const isCoinbase =
      cy?.prev_hash === '0000000000000000000000000000000000000000000000000000000000000000' ||
      ms?.is_coinbase === true
    inputs.push({
      prevTxid:    cy?.prev_hash         || (isCoinbase ? null : ms?.txid)      || null,
      outputIndex: cy?.output_index      ?? (isCoinbase ? null : ms?.vout)      ?? bc?.prev_out?.n    ?? null,
      address:     cy?.addresses?.[0]    || ms?.prevout?.scriptpubkey_address   || bc?.prev_out?.addr || null,
      valueSats:   cy?.output_value      ?? ms?.prevout?.value                  ?? bc?.prev_out?.value ?? null,
      sequence:    cy?.sequence          ?? ms?.sequence                        ?? bc?.sequence       ?? null,
      // blockchain.com internal index — used as fallback to look up the prev tx
      // when no prevTxid hash is available from the other providers
      bcTxIndex:   isCoinbase ? null : (bc?.prev_out?.tx_index ?? null),
      isCoinbase,
    })
  }

  // ── Outputs ──
  // BlockCypher has spent_by txid; mempool.space gives address/value; blockchain.com has boolean spent
  let outputs = []
  const outLen = Math.max(
    cyData?.outputs?.length ?? 0,
    msData?.vout?.length    ?? 0,
    bcData?.out?.length     ?? 0,
  )
  for (let i = 0; i < outLen; i++) {
    const cy  = cyData?.outputs?.[i]
    const ms  = msData?.vout?.[i]
    const bc  = bcData?.out?.[i]
    outputs.push({
      index:       i,
      address:     cy?.addresses?.[0]           || ms?.scriptpubkey_address || bc?.addr  || null,
      valueSats:   cy?.value                    ?? ms?.value                ?? bc?.value ?? null,
      spent:       !!cy?.spent_by               || !!bc?.spent,
      spentByTxid: cy?.spent_by                 || null,
      isOpReturn:  (!cy?.addresses && cy?.value === 0) || (!ms?.scriptpubkey_address && ms?.value === 0),
    })
  }

  const feeSats  = cyData?.fees ?? msData?.fee ?? bcData?.fee ?? null
  const totalIn  = inputs.reduce( (s, inp) => s + (inp.valueSats ?? 0), 0)
  const totalOut = outputs.reduce((s, out) => s + (out.valueSats ?? 0), 0)
  const rbf      = isRbfSignaled(inputs) || !!bcData?.rbf

  // ── UTXO-level outspend check ──
  // Tries three methods in priority order per input:
  //   1. mempool.space /outspend  (needs prevTxid hash, returns spending txid)
  //   2. blockchain.com prev-tx by tx_index (fallback when prevTxid unknown or mempool.space
  //      doesn't have the tx; fetches the prev tx, checks out[n].spent and
  //      resolves spending txid via spending_outpoints)
  const checkableInputs = inputs.filter(
    i => !i.isCoinbase && (i.prevTxid || i.bcTxIndex != null) && i.outputIndex != null
  )
  const utxoSpendChecks = checkableInputs.length > 0
    ? await Promise.all(checkableInputs.map(async inp => {

        // ── Method 1: mempool.space outspend ──
        if (inp.prevTxid) {
          const msRes = await safeFetch(
            `https://mempool.space/api/tx/${inp.prevTxid}/outspend/${inp.outputIndex}`
          )
          if (msRes.ok) {
            const d = msRes.data
            const msTxid = d.txid?.toLowerCase() || null
            return {
              prevTxid:         inp.prevTxid,
              outputIndex:      inp.outputIndex,
              address:          inp.address,
              checked:          true,
              spent:            d.spent === true,
              spentByTxid:      msTxid,
              spentByThisTx:    msTxid === txid,
              spentConfirmed:   d.status?.confirmed    || false,
              spentBlockHeight: d.status?.block_height || null,
              method:           'mempool.space',
            }
          }
        }

        // ── Method 2: blockchain.com prev-tx by tx_index ──
        // Blockchain.com stores each tx by an internal integer tx_index.
        // The rawtx response includes out[n].spent (boolean) and
        // out[n].spending_outpoints[{tx_index}] which lets us resolve the spending txid.
        if (inp.bcTxIndex != null) {
          const bcPrevRes = await safeFetch(
            `${BLOCKCHAIN_COM}/rawtx/${inp.bcTxIndex}?cors=true`
          )
          if (bcPrevRes.ok) {
            const prevTx      = bcPrevRes.data
            const prevTxidHash = prevTx.hash || inp.prevTxid || null
            const outEntry    = prevTx.out?.[inp.outputIndex]

            if (outEntry !== undefined) {
              const spent = outEntry.spent === true
              let spentByTxid      = null
              let spentConfirmed   = false
              let spentBlockHeight = null

              // Try to resolve the spending txid from spending_outpoints
              if (spent && outEntry.spending_outpoints?.length > 0) {
                const spendIdx = outEntry.spending_outpoints[0].tx_index
                const spendRes = await safeFetch(
                  `${BLOCKCHAIN_COM}/rawtx/${spendIdx}?cors=true`
                )
                if (spendRes.ok) {
                  spentByTxid      = spendRes.data.hash?.toLowerCase() || null
                  spentConfirmed   = (spendRes.data.block_height > 0) || false
                  spentBlockHeight = spendRes.data.block_height  || null
                }
              }

              return {
                prevTxid:         prevTxidHash,
                outputIndex:      inp.outputIndex,
                address:          inp.address,
                checked:          true,
                spent,
                spentByTxid,
                spentByThisTx:    spentByTxid === txid,  // both lowercased now
                spentConfirmed,
                spentBlockHeight,
                method:           'blockchain.com',
              }
            }
          }
        }

        return { prevTxid: inp.prevTxid, outputIndex: inp.outputIndex, checked: false }
      }))
    : []

  // ── Status + replacedBy override from UTXO ground truth ──
  // Only applies when NOT confirmed by any provider.
  // For confirmed TXs the inputs WILL be spent — that's expected, not a replacement signal.
  const spentElsewhere = utxoSpendChecks.find(c =>
    c.checked && c.spent && !c.spentByThisTx && (
      c.spentByTxid !== null ||
      c.method === 'blockchain.com'
    )
  )
  if (spentElsewhere && !confirmedByAnyProvider) {
    // UTXO check found inputs spent by a different TX, and no provider confirms this TX →
    // it was replaced. Also prefer the UTXO check's spending txid over BlockCypher's
    // double_spend_tx, which can point to an intermediate dropped transaction.
    status = 'REPLACED'
    if (spentElsewhere.spentByTxid) {
      replacedBy = spentElsewhere.spentByTxid
    } else if (!replacedBy) {
      replacedBy = null
    }
  }

  // Belt-and-suspenders: if any provider confirms this TX, always end up green.
  if (confirmedByAnyProvider) status = 'CONFIRMED'

  // ── Source address balances ──
  const uniqueInputAddrs = [
    ...new Set(inputs.filter(i => !i.isCoinbase && i.address).map(i => i.address))
  ].slice(0, 5)
  const sourceBalances = uniqueInputAddrs.length > 0
    ? await Promise.all(uniqueInputAddrs.map(fetchAddressBalance))
    : []

  // ── Replacing TX details ──
  let replacingTx = null
  if (replacedBy) {
    // Try BlockCypher first, fall back to mempool.space
    const repCy = await safeFetch(`${BLOCKCYPHER}/txs/${replacedBy}?limit=50&includeHex=false`)
    if (repCy.ok) {
      const r = repCy.data
      replacingTx = {
        txid:          r.hash,
        confirmations: r.confirmations ?? 0,
        blockHeight:   r.block_height > 0 ? r.block_height : null,
        feeSats:       r.fees,
        inputs:  (r.inputs  || []).map(inp => ({
          prevTxid: inp.prev_hash, outputIndex: inp.output_index,
          address:  inp.addresses?.[0] || null, valueSats: inp.output_value ?? null, isCoinbase: false,
        })),
        outputs: (r.outputs || []).map((out, i) => ({
          index: i, address: out.addresses?.[0] || null,
          valueSats: out.value ?? null, spent: !!out.spent_by,
        })),
      }
    } else {
      const repMs = await safeFetch(`https://mempool.space/api/tx/${replacedBy}`)
      if (repMs.ok) {
        const r = repMs.data
        replacingTx = {
          txid:          r.txid,
          confirmations: r.status?.confirmed ? 1 : 0,
          blockHeight:   r.status?.block_height || null,
          feeSats:       r.fee,
          inputs:  (r.vin  || []).map(inp => ({
            prevTxid: inp.txid, outputIndex: inp.vout,
            address:  inp.prevout?.scriptpubkey_address || null, valueSats: inp.prevout?.value ?? null,
            isCoinbase: inp.is_coinbase || false,
          })),
          outputs: (r.vout || []).map((out, i) => ({
            index: i, address: out.scriptpubkey_address || null,
            valueSats: out.value ?? null, spent: false,
          })),
        }
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
    utxoSpendChecks,
    sourceBalances,
    timestamp: bcData?.time || msTime || null,
    size:      bcData?.size  || cyData?.size  || msData?.size   || null,
    vsize:     cyData?.vsize || (msData?.weight ? Math.ceil(msData.weight / 4) : null),
    weight:    msData?.weight || null,
    providers: {
      blockcypher:   cyData ? 'ok' : (cyRes.notFound ? 'not found' : `error (${cyRes.error || cyRes.httpStatus})`),
      blockchainCom: bcData ? 'ok' : (bcRes.notFound ? 'not found' : `error (${bcRes.error || bcRes.httpStatus})`),
      mempoolSpace:  msData ? 'ok' : (msRes.notFound ? 'not found' : `error (${msRes.error || msRes.httpStatus})`),
    },
  }
}

// ─── Result card ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const MAP = {
    CONFIRMED:    { label: '✓ Confirmed',    cls: 'status-confirmed' },
    UNCONFIRMED:  { label: '⏳ Unconfirmed',  cls: 'status-unconfirmed' },
    REPLACED:     { label: '🔄 Replaced',    cls: 'status-replaced' },
    DOUBLE_SPENT: { label: '⚠ Double-spent', cls: 'status-replaced' },
    NOT_FOUND:    { label: '✗ Not Found',    cls: 'status-notfound' },
  }
  const { label, cls } = MAP[status] || { label: status, cls: '' }
  return <span className={`status-badge ${cls}`}>{label}</span>
}

function TxResultCard({ result }) {
  if (!result.success) {
    return (
      <div className="btc-result-card error">
        <div className="btc-result-header">
          <span className="status-badge status-error">✗ Error</span>
          <span className="result-input-label">{result.input.slice(0, 80)}</span>
        </div>
        <div className="error-msg">{result.error}</div>
      </div>
    )
  }

  const d = result.data

  // ── NOT FOUND ──
  if (d.status === 'NOT_FOUND') {
    return (
      <div className="btc-result-card not-found">
        <div className="btc-result-header">
          <StatusBadge status="NOT_FOUND" />
          <span className="result-input-label mono">{shortHash(d.txid, 14)}</span>
          <button className="copy-btn inline" onClick={() => copyToClipboard(d.txid)}>⧉</button>
        </div>
        <p className="simple-note">
          Not found on any provider — may not be broadcast, evicted from mempool, or very old.
          Input addresses are unknown (txid is a one-way hash; cannot be reversed to recover TX data).
        </p>
        <div className="provider-row">
          {Object.entries(d.providers).map(([k, v]) => (
            <span key={k}>{k}: <b className={v === 'ok' ? 'ok' : 'fail'}>{v}</b></span>
          ))}
        </div>
      </div>
    )
  }

  const isReplaced = d.status === 'REPLACED' || d.status === 'DOUBLE_SPENT'
  const checks     = d.utxoSpendChecks || []

  return (
    <div className={`btc-result-card ${d.status.toLowerCase()}`}>

      {/* ── Header ── */}
      <div className="btc-result-header">
        <StatusBadge status={d.status} />
        {d.rbf && d.status !== 'CONFIRMED' && (
          <span className="status-badge status-rbf">⚡ RBF</span>
        )}
        <span className="result-input-label mono">{shortHash(d.txid, 12)}</span>
        <button className="copy-btn inline" onClick={() => copyToClipboard(d.txid)}>⧉ txid</button>
      </div>

      {/* ── Spending TX (replaced only) ── */}
      {isReplaced && (
        <div className="simple-spending-tx">
          {d.replacedBy ? (
            <>
              <div className="simple-spending-row">
                <span className="simple-label">Spent by:</span>
                <a href={`https://mempool.space/tx/${d.replacedBy}`} target="_blank" rel="noopener noreferrer"
                   className="hash-link mono">{shortHash(d.replacedBy, 14)}</a>
                <button className="copy-btn" onClick={() => copyToClipboard(d.replacedBy)}>⧉</button>
                {(() => {
                  const c = checks.find(c => c.spentByTxid === d.replacedBy && c.spentConfirmed)
                  return c?.spentBlockHeight
                    ? <span className="replacement-confirmed-badge">✓ block {c.spentBlockHeight.toLocaleString()}</span>
                    : null
                })()}
              </div>
              <div className="simple-spending-links">
                <a href={`https://mempool.space/tx/${d.replacedBy}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 mempool</a>
                <a href={`https://www.blockchain.com/btc/tx/${d.replacedBy}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 blockchain.com</a>
                <a href={`https://live.blockcypher.com/btc/tx/${d.replacedBy}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 BlockCypher</a>
              </div>
            </>
          ) : (
            <span className="muted">Spending TX confirmed but txid not resolved — see UTXO check below.</span>
          )}
        </div>
      )}

      {/* ── Transaction Flow ── */}
      <div className="txflow">

        {/* ── Inputs column: one trace-card per input ── */}
        <div className="txflow-col">
          <div className="txflow-col-header">
            <span>↙ Inputs</span>
            <span className="txflow-count">{d.inputs.length}</span>
            {d.totalIn > 0 && (
              <span className="txflow-total">{(d.totalIn / 1e8).toFixed(8)} <span className="btc-sym">BTC</span></span>
            )}
          </div>

          {d.inputs.map((inp, idx) => {
            // ── coinbase ──
            if (inp.isCoinbase) {
              return (
                <div key={idx} className="inp-trace itc-coinbase">
                  <div className="inp-trace-header">
                    <span className="inp-trace-idx">Input #{idx}</span>
                    <span className="tag-coinbase">COINBASE</span>
                  </div>
                  <div className="inp-trace-note muted">Newly minted BTC — no previous UTXO to spend</div>
                </div>
              )
            }

            // ── find matching UTXO check ──
            const check = checks.find(c =>
              inp.prevTxid != null
                ? c.prevTxid === inp.prevTxid && c.outputIndex === inp.outputIndex
                : c.prevTxid == null && c.outputIndex === inp.outputIndex
            )

            // ── find the same UTXO as an input in the replacing TX (if any) ──
            const repInput    = d.replacingTx?.inputs?.find(ri =>
              ri.prevTxid != null && inp.prevTxid != null &&
              ri.prevTxid === inp.prevTxid && ri.outputIndex === inp.outputIndex
            )
            const repInputIdx = repInput ? d.replacingTx.inputs.indexOf(repInput) : -1

            const spentElsewhere = check?.checked && check.spent && !check.spentByThisTx
            const spentHere      = check?.checked && check.spentByThisTx
            const utxoUnspent    = check?.checked && !check.spent
            const cardCls = spentElsewhere ? 'itc-replaced'
              : spentHere   ? 'itc-this'
              : utxoUnspent ? 'itc-unspent'
              :               'itc-unknown'

            return (
              <div key={idx} className={`inp-trace ${cardCls}`}>

                {/* ── header: Input #n + amount ── */}
                <div className="inp-trace-header">
                  <span className="inp-trace-idx">Input #{idx}</span>
                  {inp.valueSats != null && (
                    <span className="inp-trace-amount">
                      <b>{(inp.valueSats / 1e8).toFixed(8)}</b> <span className="btc-sym">BTC</span>
                    </span>
                  )}
                </div>

                {/* ── source UTXO ── */}
                <div className="inp-trace-source">
                  <span className="inp-trace-label">Spending:</span>
                  {inp.prevTxid
                    ? <a href={`https://mempool.space/tx/${inp.prevTxid}`} target="_blank" rel="noopener noreferrer" className="hash-link">{shortHash(inp.prevTxid, 10)}</a>
                    : <span className="muted">unknown source</span>}
                  {inp.outputIndex != null && <span className="muted itc-vout">:{inp.outputIndex}</span>}
                  {inp.address && (
                    <>
                      <span className="muted itc-dot">·</span>
                      <a href={`https://mempool.space/address/${inp.address}`} target="_blank" rel="noopener noreferrer" className="addr-link">{shortHash(inp.address, 9)}</a>
                    </>
                  )}
                </div>

                {/* ── spent by a DIFFERENT TX (replacement) ── */}
                {spentElsewhere && (
                  <div className="inp-trace-claimed">
                    <div className="itc-claimed-title">
                      🔄 This UTXO was claimed by a different transaction
                    </div>
                    <div className="itc-claimed-detail">
                      <span className="inp-trace-label">Spent in:</span>
                      {check.spentByTxid ? (
                        <>
                          <a href={`https://mempool.space/tx/${check.spentByTxid}`} target="_blank" rel="noopener noreferrer" className="hash-link">{shortHash(check.spentByTxid, 10)}</a>
                          <button className="copy-btn" onClick={() => copyToClipboard(check.spentByTxid)}>⧉</button>
                        </>
                      ) : <span className="muted">txid unresolved</span>}
                      {repInputIdx >= 0 && <span className="itc-input-ref">Input #{repInputIdx}</span>}
                      {repInput?.valueSats != null && (
                        <span className="itc-match-amt">
                          · <b>{(repInput.valueSats / 1e8).toFixed(8)}</b> <span className="btc-sym">BTC</span>
                        </span>
                      )}
                      {check.spentConfirmed && (
                        <span className="replacement-confirmed-badge">✓ block {check.spentBlockHeight?.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* ── spent by THIS tx ── */}
                {spentHere && (
                  <div className="inp-trace-status itc-status-this">
                    ✅ Claimed by this TX{check.spentConfirmed ? ` · confirmed block ${check.spentBlockHeight?.toLocaleString()}` : ' · pending confirmation'}
                  </div>
                )}

                {/* ── UTXO still unspent ── */}
                {utxoUnspent && (
                  <div className="inp-trace-status itc-status-unspent">
                    ⏳ UTXO still unspent
                  </div>
                )}

                {/* ── check unavailable ── */}
                {!check && (
                  <div className="inp-trace-status itc-status-unknown">
                    ❓ UTXO spend status unavailable
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Outputs column: compact list ── */}
        <div className="txflow-col">
          <div className="txflow-col-header">
            <span>↗ Outputs</span>
            <span className="txflow-count">{d.outputs.length}</span>
            {d.totalOut > 0 && (
              <span className="txflow-total">{(d.totalOut / 1e8).toFixed(8)} <span className="btc-sym">BTC</span></span>
            )}
          </div>

          {d.outputs.map((out, i) => (
            <div key={i} className={`out-item ${out.isOpReturn ? 'oi-opreturn' : out.spent ? 'oi-spent' : 'oi-unspent'}`}>
              <span className="out-item-idx">#{out.index}</span>
              <span className="out-item-addr">
                {out.isOpReturn
                  ? <span className="tag-opreturn">OP_RETURN</span>
                  : out.address
                  ? <a href={`https://mempool.space/address/${out.address}`} target="_blank" rel="noopener noreferrer" className="addr-link">{shortHash(out.address, 9)}</a>
                  : <span className="muted">—</span>}
              </span>
              <span className="out-item-amount">
                {out.valueSats != null
                  ? <><b>{(out.valueSats / 1e8).toFixed(8)}</b> <span className="btc-sym">BTC</span></>
                  : <span className="muted">—</span>}
              </span>
              <span className="out-item-status">
                {out.isOpReturn ? (
                  <span className="muted">data</span>
                ) : out.spent ? (
                  <span className="oi-spent-label">
                    ✓ spent
                    {out.spentByTxid && <> · <a href={`https://mempool.space/tx/${out.spentByTxid}`} target="_blank" rel="noopener noreferrer" className="hash-link">{shortHash(out.spentByTxid, 7)}</a></>}
                  </span>
                ) : (
                  <span className="sir-unspent-label">⏳ unspent</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Fee summary ── */}
      {d.feeSats != null && (
        <div className="io-fee-row">
          <span className="io-fee-label">Fee</span>
          <span className="io-fee-amount">{(d.feeSats / 1e8).toFixed(8)} BTC</span>
          {d.vsize != null && (
            <span className="io-fee-rate">{Math.round(d.feeSats / d.vsize)} sat/vB</span>
          )}
          {d.size != null && d.vsize != null && d.size !== d.vsize && (
            <span className="io-fee-size muted">{d.vsize} vB / {d.size} B</span>
          )}
        </div>
      )}

      {/* ── TX explorer links ── */}
      <div className="simple-tx-links">
        <span className="explorer-label">TX:</span>
        <a href={`https://mempool.space/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 mempool</a>
        <a href={`https://www.blockchain.com/btc/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 blockchain.com</a>
        <a href={`https://live.blockcypher.com/btc/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 BlockCypher</a>
      </div>

      {/* ── Provider status ── */}
      <div className="provider-row">
        {Object.entries(d.providers).map(([k, v]) => (
          <span key={k}>{k}: <b className={v === 'ok' ? 'ok' : 'fail'}>{v}</b></span>
        ))}
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
