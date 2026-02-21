import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './BtcSafeToFail.css'

// ─── API endpoints ────────────────────────────────────────────────────────────
const BLOCKCYPHER    = 'https://api.blockcypher.com/v1/btc/main'
const BLOCKCHAIN_COM = 'https://blockchain.info'
const SOCHAIN        = 'https://sochain.com/api/v2/get_tx/BTC'

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

// ─── Helper: parse SoChain input value (BTC string) → satoshis ────────────────
function scSats(btcStr) {
  if (btcStr == null) return null
  const n = parseFloat(btcStr)
  return isNaN(n) ? null : Math.round(n * 1e8)
}

// ─── Helper: build a replacingTx object from BlockCypher or mempool.space data ─
function buildReplacingTx(cyData, msData) {
  if (cyData) {
    return {
      txid:          cyData.hash,
      confirmations: cyData.confirmations ?? 0,
      blockHeight:   cyData.block_height > 0 ? cyData.block_height : null,
      feeSats:       cyData.fees,
      inputs:  (cyData.inputs  || []).map(inp => ({
        prevTxid: inp.prev_hash, outputIndex: inp.output_index,
        address:  inp.addresses?.[0] || null, valueSats: inp.output_value ?? null, isCoinbase: false,
      })),
      outputs: (cyData.outputs || []).map((out, i) => ({
        index: i, address: out.addresses?.[0] || null,
        valueSats: out.value ?? null, spent: !!out.spent_by,
      })),
    }
  }
  if (msData) {
    return {
      txid:          msData.txid,
      confirmations: msData.status?.confirmed ? 1 : 0,
      blockHeight:   msData.status?.block_height || null,
      feeSats:       msData.fee,
      inputs:  (msData.vin  || []).map(inp => ({
        prevTxid: inp.txid, outputIndex: inp.vout,
        address:  inp.prevout?.scriptpubkey_address || null, valueSats: inp.prevout?.value ?? null,
        isCoinbase: inp.is_coinbase || false,
      })),
      outputs: (msData.vout || []).map((out, i) => ({
        index: i, address: out.scriptpubkey_address || null,
        valueSats: out.value ?? null, spent: false,
      })),
    }
  }
  return null
}

// ─── Core analysis ────────────────────────────────────────────────────────────
async function analyzeTx(txid) {
  // ── Step 1: Parallel-fetch four providers ─────────────────────────────────
  // SoChain v2 is the key addition over the original three:
  //   • Returns inputs[].from_output.txid — actual prevTxid hashes that
  //     blockchain.com withholds (it only exposes internal integer tx_index IDs)
  //   • Caches dropped/replaced transactions much longer than mempool.space
  const [cyRes, bcRes, msRes, scRes] = await Promise.all([
    safeFetch(`${BLOCKCYPHER}/txs/${txid}?limit=50&includeHex=false`),
    safeFetch(`${BLOCKCHAIN_COM}/rawtx/${txid}?cors=true`),
    safeFetch(`https://mempool.space/api/tx/${txid}`),
    safeFetch(`${SOCHAIN}/${txid}`, 10000),
  ])

  const cyData = cyRes.ok ? cyRes.data : null
  const bcData = bcRes.ok ? bcRes.data : null
  const msData = msRes.ok ? msRes.data : null
  // SoChain wraps the payload inside a "data" key
  const scData = (scRes.ok && scRes.data?.status === 'success') ? scRes.data.data : null

  if (!cyData && !bcData && !msData && !scData) {
    return {
      status: 'NOT_FOUND',
      txid,
      providers: {
        blockcypher:   cyRes.notFound ? 'not found' : `error (${cyRes.error || cyRes.httpStatus})`,
        blockchainCom: bcRes.notFound ? 'not found' : `error (${bcRes.error || bcRes.httpStatus})`,
        mempoolSpace:  msRes.notFound ? 'not found' : `error (${msRes.error || msRes.httpStatus})`,
        sochain:       scRes.notFound ? 'not found' : `error (${scRes.error || scRes.httpStatus})`,
      },
    }
  }

  // ── Step 2: Confirmation / block info ─────────────────────────────────────
  const msConfirmed   = msData?.status?.confirmed === true
  const msHeight      = msData?.status?.block_height  || null
  const msTime        = msData?.status?.block_time    || null
  const scConfirmed   = scData?.confirmations > 0
  const scHeight      = scData?.blockno > 0 ? scData.blockno : null
  const cyConfirms    = cyData?.confirmations ?? 0
  const cyHeight      = (cyData?.block_height > 0) ? cyData.block_height : null
  const bcHeight      = (bcData?.block_height > 0) ? bcData.block_height : null
  const blockHeight   = cyHeight ?? msHeight ?? scHeight ?? bcHeight
  const confirmations = cyConfirms || (blockHeight ? 1 : 0)

  const confirmedByAnyProvider =
    cyConfirms > 0 || !!cyHeight || !!bcHeight || msConfirmed || scConfirmed

  // ── Step 3: Double-spend / replacement detection (BlockCypher) ────────────
  const doubleSpend = cyData?.double_spend === true
  let   replacedBy  = cyData?.double_spend_tx || null

  let status = 'UNCONFIRMED'
  if (confirmedByAnyProvider) {
    status = 'CONFIRMED'
  } else if (doubleSpend) {
    status = replacedBy ? 'REPLACED' : 'DOUBLE_SPENT'
  }

  // ── Step 4: Build inputs ──────────────────────────────────────────────────
  // prevTxid priority: BlockCypher → mempool.space → SoChain → (bc.com has none)
  // SoChain provides from_output.txid — the crucial field bc.com doesn't expose.
  let inputs = []
  const maxLen = Math.max(
    cyData?.inputs?.length  ?? 0,
    msData?.vin?.length     ?? 0,
    bcData?.inputs?.length  ?? 0,
    scData?.inputs?.length  ?? 0,
  )
  for (let i = 0; i < maxLen; i++) {
    const cy = cyData?.inputs?.[i]
    const ms = msData?.vin?.[i]
    const bc = bcData?.inputs?.[i]
    const sc = scData?.inputs?.[i]   // SoChain: { from_output: { txid, output_no }, address, value }
    const isCoinbase =
      cy?.prev_hash === '0000000000000000000000000000000000000000000000000000000000000000' ||
      ms?.is_coinbase === true ||
      sc?.from_output == null && sc != null  // SoChain coinbase has no from_output
    inputs.push({
      prevTxid:    cy?.prev_hash
                || (isCoinbase ? null : ms?.txid)
                || (isCoinbase ? null : sc?.from_output?.txid?.toLowerCase())
                || null,
      outputIndex: cy?.output_index
                ?? (isCoinbase ? null : ms?.vout)
                ?? sc?.from_output?.output_no
                ?? bc?.prev_out?.n
                ?? null,
      address:     cy?.addresses?.[0]
                || ms?.prevout?.scriptpubkey_address
                || sc?.address
                || bc?.prev_out?.addr
                || null,
      valueSats:   cy?.output_value
                ?? ms?.prevout?.value
                ?? scSats(sc?.value)
                ?? bc?.prev_out?.value
                ?? null,
      sequence:    cy?.sequence ?? ms?.sequence ?? bc?.sequence ?? null,
      bcTxIndex:   isCoinbase ? null : (bc?.prev_out?.tx_index ?? null),
      isCoinbase,
    })
  }

  // ── Step 5: Build outputs ─────────────────────────────────────────────────
  let outputs = []
  const outLen = Math.max(
    cyData?.outputs?.length ?? 0,
    msData?.vout?.length    ?? 0,
    bcData?.out?.length     ?? 0,
  )
  for (let i = 0; i < outLen; i++) {
    const cy = cyData?.outputs?.[i]
    const ms = msData?.vout?.[i]
    const bc = bcData?.out?.[i]
    outputs.push({
      index:       i,
      address:     cy?.addresses?.[0]           || ms?.scriptpubkey_address || bc?.addr  || null,
      valueSats:   cy?.value                    ?? ms?.value                ?? bc?.value ?? null,
      spent:       !!cy?.spent_by               || !!bc?.spent,
      spentByTxid: cy?.spent_by                 || null,
      isOpReturn:  (!cy?.addresses && cy?.value === 0) || (!ms?.scriptpubkey_address && ms?.value === 0),
    })
  }

  const feeSats  = cyData?.fees ?? msData?.fee ?? scSats(scData?.fee) ?? bcData?.fee ?? null
  const totalIn  = inputs.reduce( (s, inp) => s + (inp.valueSats ?? 0), 0)
  const totalOut = outputs.reduce((s, out) => s + (out.valueSats ?? 0), 0)
  const rbf      = isRbfSignaled(inputs) || !!bcData?.rbf

  // ── Step 6: Early replacing-TX fetch + input enrichment ───────────────────
  // KEY INSIGHT: An RBF replacement MUST reuse the exact same input UTXOs.
  // So if BlockCypher already tells us the replacing TX hash, we can fetch it
  // NOW (before UTXO checks) and cross-reference its inputs — which DO have
  // prevTxid hashes from BlockCypher/mempool — to fill gaps in our inputs.
  // This makes the UTXO outspend checks actually work for bc.com-only TXs.
  let replacingTx = null
  if (replacedBy) {
    const [repCyRes, repMsRes] = await Promise.all([
      safeFetch(`${BLOCKCYPHER}/txs/${replacedBy}?limit=50&includeHex=false`),
      safeFetch(`https://mempool.space/api/tx/${replacedBy}`),
    ])
    replacingTx = buildReplacingTx(
      repCyRes.ok ? repCyRes.data : null,
      repMsRes.ok ? repMsRes.data : null,
    )

    // Enrich inputs that are missing prevTxid by matching against replacing TX inputs.
    // Match priority: same address, then same outputIndex as fallback.
    if (replacingTx?.inputs?.length > 0) {
      inputs = inputs.map(inp => {
        if (inp.prevTxid != null || inp.isCoinbase) return inp
        const match = replacingTx.inputs.find(ri =>
          ri.prevTxid != null && (
            (inp.address != null && ri.address === inp.address) ||
            (inp.outputIndex != null && ri.outputIndex === inp.outputIndex)
          )
        )
        if (!match) return inp
        return {
          ...inp,
          prevTxid:    match.prevTxid,
          outputIndex: inp.outputIndex ?? match.outputIndex,
          // fill address/value from replacing TX if still missing
          address:     inp.address    ?? match.address,
          valueSats:   inp.valueSats  ?? match.valueSats,
          enrichedFromReplacingTx: true,
        }
      })
    }
  }

  // ── Step 7: UTXO-level outspend checks ────────────────────────────────────
  // Inputs are now enriched with prevTxids from SoChain (Step 4) or the
  // replacing TX (Step 6), so Method 1 (mempool.space /outspend) should
  // succeed in cases that previously fell through to "status unavailable".
  const checkableInputs = inputs.filter(
    i => !i.isCoinbase && (i.prevTxid || i.bcTxIndex != null) && i.outputIndex != null
  )
  const utxoSpendChecks = checkableInputs.length > 0
    ? await Promise.all(checkableInputs.map(async inp => {

        // ── Method 1: mempool.space /outspend ──
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
        if (inp.bcTxIndex != null) {
          const bcPrevRes = await safeFetch(
            `${BLOCKCHAIN_COM}/rawtx/${inp.bcTxIndex}?cors=true`
          )
          if (bcPrevRes.ok) {
            const prevTx       = bcPrevRes.data
            const prevTxidHash = prevTx.hash || inp.prevTxid || null
            const outEntry     = prevTx.out?.[inp.outputIndex]

            if (outEntry !== undefined) {
              const spent = outEntry.spent === true
              let spentByTxid      = null
              let spentConfirmed   = false
              let spentBlockHeight = null

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
                spentByThisTx:    spentByTxid === txid,
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

  // ── Step 8: Status + replacedBy override from UTXO ground truth ──────────
  const spentElsewhere = utxoSpendChecks.find(c =>
    c.checked && c.spent && !c.spentByThisTx && (
      c.spentByTxid !== null || c.method === 'blockchain.com'
    )
  )
  if (spentElsewhere && !confirmedByAnyProvider) {
    status = 'REPLACED'
    if (spentElsewhere.spentByTxid) {
      // If UTXO checks found a different replacedBy than the early fetch used,
      // we need to re-fetch the replacingTx with the authoritative txid.
      if (spentElsewhere.spentByTxid !== replacedBy) {
        replacedBy = spentElsewhere.spentByTxid
        const [repCyRes2, repMsRes2] = await Promise.all([
          safeFetch(`${BLOCKCYPHER}/txs/${replacedBy}?limit=50&includeHex=false`),
          safeFetch(`https://mempool.space/api/tx/${replacedBy}`),
        ])
        replacingTx = buildReplacingTx(
          repCyRes2.ok ? repCyRes2.data : null,
          repMsRes2.ok ? repMsRes2.data : null,
        )
      }
    } else if (!replacedBy) {
      replacedBy = null
    }
  }

  if (confirmedByAnyProvider) status = 'CONFIRMED'

  // ── Step 9: Source address balances ───────────────────────────────────────
  const uniqueInputAddrs = [
    ...new Set(inputs.filter(i => !i.isCoinbase && i.address).map(i => i.address))
  ].slice(0, 5)
  const sourceBalances = uniqueInputAddrs.length > 0
    ? await Promise.all(uniqueInputAddrs.map(fetchAddressBalance))
    : []

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
    size:      bcData?.size  || cyData?.size  || msData?.size  || scData?.size  || null,
    vsize:     cyData?.vsize || (msData?.weight ? Math.ceil(msData.weight / 4) : null),
    weight:    msData?.weight || null,
    providers: {
      blockcypher:   cyData  ? 'ok' : (cyRes.notFound  ? 'not found' : `error (${cyRes.error  || cyRes.httpStatus})`),
      blockchainCom: bcData  ? 'ok' : (bcRes.notFound  ? 'not found' : `error (${bcRes.error  || bcRes.httpStatus})`),
      mempoolSpace:  msData  ? 'ok' : (msRes.notFound  ? 'not found' : `error (${msRes.error  || msRes.httpStatus})`),
      sochain:       scData  ? 'ok' : (scRes.notFound  ? 'not found' : `error (${scRes.error  || scRes.httpStatus})`),
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
            // Match by prevTxid+outputIndex first; fall back to address match
            // (needed when prevTxid is unavailable on the original TX).
            const repInput = d.replacingTx?.inputs?.find(ri =>
              ri.prevTxid != null && inp.prevTxid != null
                ? ri.prevTxid === inp.prevTxid && ri.outputIndex === inp.outputIndex
                : inp.address != null && ri.address === inp.address
            )
            const repInputIdx = repInput ? d.replacingTx.inputs.indexOf(repInput) : -1

            const spentElsewhere = check?.checked && check.spent && !check.spentByThisTx
            const spentHere      = check?.checked && check.spentByThisTx
            const utxoUnspent    = check?.checked && !check.spent
            const cardCls = spentElsewhere ? 'itc-replaced'
              : spentHere   ? 'itc-this'
              : utxoUnspent ? 'itc-unspent'
              :               'itc-unknown'

            // shared source footnote (prevTxid from repInput as fallback)
            const srcTxid = inp.prevTxid || repInput?.prevTxid || null
            const srcIdx  = inp.outputIndex ?? repInput?.outputIndex ?? null
            const isReplacedInput = spentElsewhere || (!check && isReplaced && d.replacedBy)

            // spending txid to show in claim block
            const claimTxid = spentElsewhere ? check?.spentByTxid : d.replacedBy
            const claimBlockHeight = spentElsewhere
              ? (check?.spentConfirmed ? check?.spentBlockHeight : null)
              : d.replacingTx?.blockHeight

            return (
              <div key={idx} className={`inp-trace ${cardCls}`}>

                {isReplacedInput ? (
                  /* ══ REPLACED FLOW: source card → arrow → claim card ══ */
                  <>
                    {/* ── Source: this (checked) transaction ── */}
                    <div className="itc-source">
                      <div className="itc-source-label">This transaction · provided</div>
                      <div className="itc-source-body">
                        <div className="itc-source-left">
                          <span className="inp-trace-idx">Input #{idx}</span>
                          {inp.address && (
                            <a href={`https://mempool.space/address/${inp.address}`} target="_blank" rel="noopener noreferrer"
                               className="addr-link inp-trace-addr">{shortHash(inp.address, 11)}</a>
                          )}
                        </div>
                        {inp.valueSats != null && (
                          <span className="inp-trace-amount">
                            <b>{(inp.valueSats / 1e8).toFixed(8)}</b> <span className="btc-sym">BTC</span>
                          </span>
                        )}
                      </div>
                      <div className="itc-source-links">
                        {d.providers.mempoolSpace  === 'ok' && <a href={`https://mempool.space/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 mempool</a>}
                        {d.providers.blockchainCom === 'ok' && <a href={`https://www.blockchain.com/btc/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 blockchain.com</a>}
                        {d.providers.blockcypher   === 'ok' && <a href={`https://live.blockcypher.com/btc/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 BlockCypher</a>}
                      </div>
                    </div>

                    {/* ── Flow arrow ── */}
                    <div className="itc-flow-arrow">↓ this input was claimed by</div>

                    {/* ── Claim: the replacing transaction ── */}
                    <div className="inp-trace-claimed">
                      <div className="itc-claimed-title">
                        This UTXO was claimed by the below transaction
                      </div>
                      <div className="itc-claimed-detail">
                        <span className="inp-trace-label">Spent in:</span>
                        {claimTxid ? (
                          <>
                            <a href={`https://mempool.space/tx/${claimTxid}`} target="_blank" rel="noopener noreferrer" className="hash-link">{shortHash(claimTxid, 10)}</a>
                            <button className="copy-btn" onClick={() => copyToClipboard(claimTxid)}>⧉</button>
                          </>
                        ) : <span className="muted">txid unresolved</span>}
                        {repInputIdx >= 0 && <span className="itc-input-ref">Input #{repInputIdx}</span>}
                        {repInput?.valueSats != null && (
                          <span className="itc-match-amt">
                            · <b>{(repInput.valueSats / 1e8).toFixed(8)}</b> <span className="btc-sym">BTC</span>
                          </span>
                        )}
                        {claimBlockHeight && (
                          <span className="replacement-confirmed-badge">✓ block {claimBlockHeight.toLocaleString()}</span>
                        )}
                      </div>
                      {claimTxid && (
                        <div className="itc-explorer-links">
                          <a href={`https://mempool.space/tx/${claimTxid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 mempool</a>
                          <a href={`https://www.blockchain.com/btc/tx/${claimTxid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 blockchain.com</a>
                          <a href={`https://live.blockcypher.com/btc/tx/${claimTxid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 BlockCypher</a>
                        </div>
                      )}
                    </div>

                    {/* ── Source footnote ── */}
                    {srcTxid && (
                      <div className="inp-trace-footnote">
                        <span className="itc-fn-label">Source UTXO:</span>
                        <a href={`https://mempool.space/tx/${srcTxid}`} target="_blank" rel="noopener noreferrer"
                           className="hash-link itc-fn-link">{shortHash(srcTxid, 10)}</a>
                        {srcIdx != null && <span className="muted">:{srcIdx}</span>}
                      </div>
                    )}
                  </>
                ) : (
                  /* ══ STANDARD layout: confirmed / unspent / unknown ══ */
                  <>
                    <div className="inp-trace-header">
                      <div className="inp-trace-header-left">
                        <span className="inp-trace-idx">Input #{idx}</span>
                        {inp.address && (
                          <a href={`https://mempool.space/address/${inp.address}`} target="_blank" rel="noopener noreferrer"
                             className="addr-link inp-trace-addr">{shortHash(inp.address, 11)}</a>
                        )}
                      </div>
                      {inp.valueSats != null && (
                        <span className="inp-trace-amount">
                          <b>{(inp.valueSats / 1e8).toFixed(8)}</b> <span className="btc-sym">BTC</span>
                        </span>
                      )}
                    </div>

                    {spentHere && (
                      <div className="inp-trace-status itc-status-this">
                        ✅ Claimed by this TX{check.spentConfirmed ? ` · confirmed block ${check.spentBlockHeight?.toLocaleString()}` : ' · pending confirmation'}
                      </div>
                    )}
                    {utxoUnspent && (
                      <div className="inp-trace-status itc-status-unspent">
                        ⏳ UTXO still unspent
                      </div>
                    )}
                    {!check && (
                      <div className="inp-trace-status itc-status-unknown">
                        ❓ UTXO spend status unavailable
                      </div>
                    )}

                    {srcTxid && (
                      <div className="inp-trace-footnote">
                        <span className="itc-fn-label">Source UTXO:</span>
                        <a href={`https://mempool.space/tx/${srcTxid}`} target="_blank" rel="noopener noreferrer"
                           className="hash-link itc-fn-link">{shortHash(srcTxid, 10)}</a>
                        {srcIdx != null && <span className="muted">:{srcIdx}</span>}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
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

      {/* ── TX explorer links — only for non-replaced TXs; replaced TXs show
           these per-input inside the source card above ── */}
      {!isReplaced && (
        <div className="simple-tx-links">
          <span className="explorer-label">TX:</span>
          {d.providers.mempoolSpace  === 'ok' && <a href={`https://mempool.space/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 mempool</a>}
          {d.providers.blockchainCom === 'ok' && <a href={`https://www.blockchain.com/btc/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 blockchain.com</a>}
          {d.providers.blockcypher   === 'ok' && <a href={`https://live.blockcypher.com/btc/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 BlockCypher</a>}
        </div>
      )}

      {/* ── Provider status (sochain excluded from display) ── */}
      <div className="provider-row">
        {Object.entries(d.providers)
          .filter(([k]) => k !== 'sochain')
          .map(([k, v]) => (
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
