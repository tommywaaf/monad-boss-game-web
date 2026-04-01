import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { trackUsage } from '../utils/counter'
import ToolInfoPanel from '../components/ToolInfoPanel'
import './BtcSafeToFail.css'

// ─── Chain configurations ────────────────────────────────────────────────────
const CHAINS = {
  btc: {
    id: 'btc',
    label: 'BTC',
    name: 'Bitcoin',
    symbol: 'BTC',
    icon: '₿',
    blockcypher:           'https://api.blockcypher.com/v1/btc/main',
    mempoolApi:            'https://mempool.space/api',
    mempoolSite:           'https://mempool.space',
    mempoolLabel:          'mempool',
    sochain:               'https://sochain.com/api/v2/get_tx/BTC',
    blockchainCom:         'https://blockchain.info',
    hasBlockchainCom:      true,
    blockcypherExplorer:   'https://live.blockcypher.com/btc',
    blockchainComExplorer: 'https://www.blockchain.com/explorer/transactions/btc',
  },
  ltc: {
    id: 'ltc',
    label: 'LTC',
    name: 'Litecoin',
    symbol: 'LTC',
    icon: 'Ł',
    blockcypher:           'https://api.blockcypher.com/v1/ltc/main',
    mempoolApi:            'https://litecoinspace.org/api',
    mempoolSite:           'https://litecoinspace.org',
    mempoolLabel:          'ltcspace',
    sochain:               'https://sochain.com/api/v2/get_tx/LTC',
    blockchainCom:         null,
    hasBlockchainCom:      false,
    blockcypherExplorer:   'https://live.blockcypher.com/ltc',
    blockchainComExplorer: null,
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TXID_RE = /^[0-9a-fA-F]{64}$/

function extractTxid(raw, chainCfg) {
  raw = raw.trim()
  if (TXID_RE.test(raw)) return raw.toLowerCase()
  try {
    const url = new URL(raw)
    const path = url.pathname.replace(/^\/+|\/+$/g, '')
    const m = path.match(/(?:(?:btc|ltc)\/)?txs?\/([0-9a-fA-F]{64})$/)
    if (m) return m[1].toLowerCase()
  } catch { /* not a URL */ }
  throw new Error(
    `Cannot extract a valid ${chainCfg.label} txid from: "${raw.slice(0, 80)}"\n` +
    `Expected a 64-hex string or a URL from ${chainCfg.mempoolSite} / blockcypher.com.`
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

function shortHash(hash) {
  if (!hash) return '?'
  return hash
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

// ─── Address balance fetch ────────────────────────────────────────────────────
async function fetchAddressBalance(addr, chainCfg) {
  const cyRes = await safeFetch(`${chainCfg.blockcypher}/addrs/${addr}/balance`)
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

  if (chainCfg.hasBlockchainCom) {
    const bcRes = await safeFetch(`${chainCfg.blockchainCom}/balance?active=${addr}&cors=true`)
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
  }

  return { addr, finalBalance: null, error: true, source: null }
}

// ─── Helper: parse SoChain input value (coin string) → satoshis ──────────────
function scSats(btcStr) {
  if (btcStr == null) return null
  const n = parseFloat(btcStr)
  return isNaN(n) ? null : Math.round(n * 1e8)
}

// ─── Helper: build a replacingTx object from BlockCypher or mempool-style data
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
async function analyzeTx(txid, chainCfg) {
  // ── Step 1: Parallel-fetch providers ──────────────────────────────────────
  const [cyRes, bcRes, msRes, scRes] = await Promise.all([
    safeFetch(`${chainCfg.blockcypher}/txs/${txid}?limit=50&includeHex=false`),
    chainCfg.hasBlockchainCom
      ? safeFetch(`${chainCfg.blockchainCom}/rawtx/${txid}?cors=true`)
      : Promise.resolve({ ok: false, skipped: true }),
    safeFetch(`${chainCfg.mempoolApi}/tx/${txid}`),
    safeFetch(`${chainCfg.sochain}/${txid}`, 10000),
  ])

  const cyData = cyRes.ok ? cyRes.data : null
  const bcData = bcRes.ok ? bcRes.data : null
  const msData = msRes.ok ? msRes.data : null
  const scData = (scRes.ok && scRes.data?.status === 'success') ? scRes.data.data : null

  if (!cyData && !bcData && !msData && !scData) {
    const providers = {
      blockcypher:  cyRes.notFound ? 'not found' : `error (${cyRes.error || cyRes.httpStatus})`,
      mempoolSpace: msRes.notFound ? 'not found' : `error (${msRes.error || msRes.httpStatus})`,
      sochain:      scRes.notFound ? 'not found' : `error (${scRes.error || scRes.httpStatus})`,
    }
    if (chainCfg.hasBlockchainCom) {
      providers.blockchainCom = bcRes.notFound ? 'not found' : `error (${bcRes.error || bcRes.httpStatus})`
    }
    return { status: 'NOT_FOUND', txid, providers }
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
    const sc = scData?.inputs?.[i]
    const isCoinbase =
      cy?.prev_hash === '0000000000000000000000000000000000000000000000000000000000000000' ||
      ms?.is_coinbase === true ||
      sc?.from_output == null && sc != null
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
  let replacingTx = null
  if (replacedBy) {
    const [repCyRes, repMsRes] = await Promise.all([
      safeFetch(`${chainCfg.blockcypher}/txs/${replacedBy}?limit=50&includeHex=false`),
      safeFetch(`${chainCfg.mempoolApi}/tx/${replacedBy}`),
    ])
    replacingTx = buildReplacingTx(
      repCyRes.ok ? repCyRes.data : null,
      repMsRes.ok ? repMsRes.data : null,
    )

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
          address:     inp.address    ?? match.address,
          valueSats:   inp.valueSats  ?? match.valueSats,
          enrichedFromReplacingTx: true,
        }
      })
    }
  }

  // ── Step 7: UTXO-level outspend checks ────────────────────────────────────
  const checkableInputs = inputs.filter(
    i => !i.isCoinbase && (i.prevTxid || i.bcTxIndex != null) && i.outputIndex != null
  )
  const utxoSpendChecks = checkableInputs.length > 0
    ? await Promise.all(checkableInputs.map(async inp => {

        // ── Method 1: mempool-style /outspend ──
        if (inp.prevTxid) {
          const msRes = await safeFetch(
            `${chainCfg.mempoolApi}/tx/${inp.prevTxid}/outspend/${inp.outputIndex}`
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
              method:           chainCfg.mempoolLabel,
            }
          }
        }

        // ── Method 2: blockchain.com prev-tx by tx_index (BTC only) ──
        if (chainCfg.hasBlockchainCom && inp.bcTxIndex != null) {
          const bcPrevRes = await safeFetch(
            `${chainCfg.blockchainCom}/rawtx/${inp.bcTxIndex}?cors=true`
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
                  `${chainCfg.blockchainCom}/rawtx/${spendIdx}?cors=true`
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
      if (spentElsewhere.spentByTxid !== replacedBy) {
        replacedBy = spentElsewhere.spentByTxid
        const [repCyRes2, repMsRes2] = await Promise.all([
          safeFetch(`${chainCfg.blockcypher}/txs/${replacedBy}?limit=50&includeHex=false`),
          safeFetch(`${chainCfg.mempoolApi}/tx/${replacedBy}`),
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
    ? await Promise.all(uniqueInputAddrs.map(a => fetchAddressBalance(a, chainCfg)))
    : []

  const providers = {
    blockcypher:  cyData ? 'ok' : (cyRes.notFound  ? 'not found' : `error (${cyRes.error  || cyRes.httpStatus})`),
    mempoolSpace: msData ? 'ok' : (msRes.notFound  ? 'not found' : `error (${msRes.error  || msRes.httpStatus})`),
    sochain:      scData ? 'ok' : (scRes.notFound  ? 'not found' : `error (${scRes.error  || scRes.httpStatus})`),
  }
  if (chainCfg.hasBlockchainCom) {
    providers.blockchainCom = bcData ? 'ok' : (bcRes.notFound ? 'not found' : `error (${bcRes.error || bcRes.httpStatus})`)
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
    size:      bcData?.size  || cyData?.size  || msData?.size  || scData?.size  || null,
    vsize:     cyData?.vsize || (msData?.weight ? Math.ceil(msData.weight / 4) : null),
    weight:    msData?.weight || null,
    providers,
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

function TxResultCard({ result, chainCfg }) {
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
              <span className="txflow-total">{(d.totalIn / 1e8).toFixed(8)} <span className="btc-sym">{chainCfg.symbol}</span></span>
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
                  <div className="inp-trace-note muted">Newly minted {chainCfg.symbol} — no previous UTXO to spend</div>
                </div>
              )
            }

            // ── find matching UTXO check ──
            const check = checks.find(c =>
              inp.prevTxid != null
                ? c.prevTxid === inp.prevTxid && c.outputIndex === inp.outputIndex
                : c.prevTxid == null && c.outputIndex === inp.outputIndex
            )

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

            const srcTxid = inp.prevTxid || repInput?.prevTxid || null
            const srcIdx  = inp.outputIndex ?? repInput?.outputIndex ?? null
            const isReplacedInput = spentElsewhere || (!check && isReplaced && d.replacedBy)

            const claimTxid = spentElsewhere ? check?.spentByTxid : d.replacedBy
            const claimBlockHeight = spentElsewhere
              ? (check?.spentConfirmed ? check?.spentBlockHeight : null)
              : d.replacingTx?.blockHeight

            return (
              <div key={idx} className={`inp-trace ${cardCls}`}>

                {isReplacedInput ? (
                  <>
                    {/* ── Source: this (checked) transaction ── */}
                    <div className="itc-source">
                      <div className="itc-source-label">The Provided Transaction</div>
                      <div className="itc-source-body">
                        <div className="itc-source-left">
                          <span className="inp-trace-idx">Input #{idx}</span>
                          {inp.address && (
                            <a href={`${chainCfg.mempoolSite}/address/${inp.address}`} target="_blank" rel="noopener noreferrer"
                               className="addr-link inp-trace-addr">{shortHash(inp.address, 11)}</a>
                          )}
                        </div>
                        {inp.valueSats != null && (
                          <span className="inp-trace-amount">
                            <b>{(inp.valueSats / 1e8).toFixed(8)}</b> <span className="btc-sym">{chainCfg.symbol}</span>
                          </span>
                        )}
                      </div>
                      <div className="itc-source-links">
                        {d.providers.mempoolSpace  === 'ok' && <a href={`${chainCfg.mempoolSite}/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 {chainCfg.mempoolLabel}</a>}
                        {d.providers.blockchainCom === 'ok' && <a href={`${chainCfg.blockchainComExplorer}/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 blockchain.com</a>}
                        {d.providers.blockcypher   === 'ok' && <a href={`${chainCfg.blockcypherExplorer}/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 BlockCypher</a>}
                      </div>
                    </div>

                    {/* ── Flow arrow ── */}
                    <div className="itc-flow-arrow">↓ this input was claimed by</div>

                    {/* ── Claim: the replacing transaction ── */}
                    <div className="inp-trace-claimed">
                      <div className="itc-claimed-detail">
                        <span className="inp-trace-label">Spent in:</span>
                        {claimTxid ? (
                          <>
                            <a href={`${chainCfg.mempoolSite}/tx/${claimTxid}`} target="_blank" rel="noopener noreferrer" className="hash-link">{shortHash(claimTxid, 10)}</a>
                            <button className="copy-btn" onClick={() => copyToClipboard(claimTxid)}>⧉</button>
                          </>
                        ) : <span className="muted">txid unresolved</span>}
                        {repInputIdx >= 0 && <span className="itc-input-ref">Input #{repInputIdx}</span>}
                        {repInput?.valueSats != null && (
                          <span className="itc-match-amt">
                            · <b>{(repInput.valueSats / 1e8).toFixed(8)}</b> <span className="btc-sym">{chainCfg.symbol}</span>
                          </span>
                        )}
                        {claimBlockHeight && (
                          <span className="replacement-confirmed-badge">✓ block {claimBlockHeight.toLocaleString()}</span>
                        )}
                      </div>
                      {claimTxid && (
                        <div className="itc-explorer-links">
                          <a href={`${chainCfg.mempoolSite}/tx/${claimTxid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 {chainCfg.mempoolLabel}</a>
                          {chainCfg.blockchainComExplorer && <a href={`${chainCfg.blockchainComExplorer}/${claimTxid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 blockchain.com</a>}
                          <a href={`${chainCfg.blockcypherExplorer}/tx/${claimTxid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 BlockCypher</a>
                        </div>
                      )}
                    </div>

                    {/* ── Source footnote ── */}
                    {srcTxid && (
                      <div className="inp-trace-footnote">
                        <span className="itc-fn-label">Source TX (where the input came from):</span>
                        <a href={`${chainCfg.mempoolSite}/tx/${srcTxid}`} target="_blank" rel="noopener noreferrer"
                           className="hash-link itc-fn-link">{shortHash(srcTxid, 10)}</a>
                        {srcIdx != null && <span className="muted">:{srcIdx}</span>}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="inp-trace-header">
                      <div className="inp-trace-header-left">
                        <span className="inp-trace-idx">Input #{idx}</span>
                        {inp.address && (
                          <a href={`${chainCfg.mempoolSite}/address/${inp.address}`} target="_blank" rel="noopener noreferrer"
                             className="addr-link inp-trace-addr">{shortHash(inp.address, 11)}</a>
                        )}
                      </div>
                      {inp.valueSats != null && (
                        <span className="inp-trace-amount">
                          <b>{(inp.valueSats / 1e8).toFixed(8)}</b> <span className="btc-sym">{chainCfg.symbol}</span>
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
                        <span className="itc-fn-label">Source UTXO (where the input came from):</span>
                        <a href={`${chainCfg.mempoolSite}/tx/${srcTxid}`} target="_blank" rel="noopener noreferrer"
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
          <span className="io-fee-amount">{(d.feeSats / 1e8).toFixed(8)} {chainCfg.symbol}</span>
          {d.vsize != null && (
            <span className="io-fee-rate">{Math.round(d.feeSats / d.vsize)} sat/vB</span>
          )}
          {d.size != null && d.vsize != null && d.size !== d.vsize && (
            <span className="io-fee-size muted">{d.vsize} vB / {d.size} B</span>
          )}
        </div>
      )}

      {/* ── TX explorer links ── */}
      {!isReplaced && (
        <div className="simple-tx-links">
          <span className="explorer-label">TX:</span>
          {d.providers.mempoolSpace  === 'ok' && <a href={`${chainCfg.mempoolSite}/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 {chainCfg.mempoolLabel}</a>}
          {d.providers.blockchainCom === 'ok' && <a href={`${chainCfg.blockchainComExplorer}/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 blockchain.com</a>}
          {d.providers.blockcypher   === 'ok' && <a href={`${chainCfg.blockcypherExplorer}/tx/${d.txid}`} target="_blank" rel="noopener noreferrer" className="explorer-btn">🔗 BlockCypher</a>}
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

  // ── Chain selector ──
  const [chain, setChain] = useState('btc')
  const C = CHAINS[chain]

  useEffect(() => {
    document.title = `${C.label} Safe-to-Fail`
    return () => { document.title = 'Monad Boss Game' }
  }, [C.label])

  // ── Detail mode state ──
  const [input,      setInput]      = useState('')
  const [results,    setResults]    = useState([])
  const [processing, setProcessing] = useState(false)
  const [progress,   setProgress]   = useState(0)
  const [statusMsg,  setStatusMsg]  = useState('')
  const progressRef  = useRef(null)

  // ── Batch mode state ──
  const [viewMode,          setViewMode]          = useState('detail')
  const [batchRows,         setBatchRows]         = useState([])
  const [batchConcurrency,  setBatchConcurrency]  = useState(2)
  const [batchDelay,        setBatchDelay]        = useState(1000)
  const [batchProgress,     setBatchProgress]     = useState({ current: 0, total: 0 })
  const [batchPage,         setBatchPage]         = useState(1)
  const [batchPerPage,      setBatchPerPage]      = useState(100)
  const [batchSearch,       setBatchSearch]       = useState('')
  const [batchStatusFilter, setBatchStatusFilter] = useState('all')
  const abortRef = useRef(false)

  const handleChainChange = (newChain) => {
    if (newChain === chain || processing) return
    setChain(newChain)
    setResults([])
    setBatchRows([])
    setBatchProgress({ current: 0, total: 0 })
  }

  useEffect(() => {
    if (processing && viewMode === 'detail') {
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
  }, [processing, viewMode])

  // ── Detail mode submit ──
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const items = input.trim().split(/[\s,\n]+/).filter(x => x.trim())
    trackUsage(C.id, items.length)
    setProcessing(true)
    setResults([])

    const newResults = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      setStatusMsg(`Analyzing ${i + 1} / ${items.length}: ${item.slice(0, 30)}…`)
      try {
        const txid  = extractTxid(item, C)
        const data  = await analyzeTx(txid, C)
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

  // ── Batch mode: run with concurrency + rate limiting ──
  const handleBatchRun = async () => {
    if (!input.trim()) return
    const items = input.trim().split(/[\s,\n]+/).filter(x => x.trim())

    trackUsage(C.id, items.length)
    abortRef.current = false
    setProcessing(true)
    setBatchRows([])
    setBatchProgress({ current: 0, total: items.length })
    setBatchPage(1)

    const rowsRef = []
    let completed = 0

    for (let i = 0; i < items.length; i += batchConcurrency) {
      if (abortRef.current) break
      const batch = items.slice(i, i + batchConcurrency)

      await Promise.all(batch.map(async (item, bIdx) => {
        if (abortRef.current) return
        if (bIdx > 0) await new Promise(r => setTimeout(r, bIdx * 300))
        if (abortRef.current) return

        const rowIndex = i + bIdx + 1
        try {
          const txid = extractTxid(item, C)
          const d    = await analyzeTx(txid, C)
          rowsRef.push({ index: rowIndex, input: item, txid, status: d.status, replacedBy: d.replacedBy || null, blockHeight: d.blockHeight || null, error: null })
        } catch (err) {
          rowsRef.push({ index: rowIndex, input: item, txid: null, status: 'ERROR', replacedBy: null, blockHeight: null, error: err.message })
        }
        completed++
        setBatchProgress({ current: completed, total: items.length })
        setBatchRows([...rowsRef].sort((a, b) => a.index - b.index))
      }))

      if (!abortRef.current && i + batchConcurrency < items.length) {
        await new Promise(r => setTimeout(r, batchDelay))
      }
    }
    setProcessing(false)
  }

  const handleStop = () => { abortRef.current = true }

  // ── CSV download ──
  const downloadCSV = () => {
    if (batchRows.length === 0) return
    const header = ['#', 'Checked TX', 'Status', 'Spending TX', 'Block']
    const rows = batchRows.map(r => [
      r.index,
      `"${r.txid || r.input}"`,
      r.status,
      r.replacedBy  || '',
      r.blockHeight || '',
    ])
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${C.id}-status-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Batch table: filter + paginate ──
  const filteredBatch = batchRows.filter(r => {
    const matchStatus = batchStatusFilter === 'all' || r.status === batchStatusFilter
    const q = batchSearch.toLowerCase()
    const matchSearch = !q || (r.txid || r.input || '').toLowerCase().includes(q) ||
                        (r.replacedBy || '').toLowerCase().includes(q)
    return matchStatus && matchSearch
  })
  const batchTotalPages   = Math.max(1, Math.ceil(filteredBatch.length / batchPerPage))
  const paginatedBatch    = filteredBatch.slice((batchPage - 1) * batchPerPage, batchPage * batchPerPage)

  const BATCH_STATUS_COLORS = {
    CONFIRMED:   'bsr-confirmed',
    REPLACED:    'bsr-replaced',
    DOUBLE_SPENT:'bsr-replaced',
    UNCONFIRMED: 'bsr-unconfirmed',
    NOT_FOUND:   'bsr-notfound',
    ERROR:       'bsr-error',
  }

  return (
    <div className="btc-page">
      {/* ── Sidebar ── */}
      <nav className="page-sidebar">
        <div className="sidebar-header"><h3>Navigation</h3></div>
        <div className="sidebar-links">
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
          <Link to="/tx-fetcher"
            className={`sidebar-link ${location.pathname === '/tx-fetcher' ? 'active' : ''}`}>
            <span className="sidebar-icon">📥</span>
            <span className="sidebar-text">TX Fetcher</span>
          </Link>
          <Link to="/ton-details"
            className={`sidebar-link ${location.pathname === '/ton-details' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔍</span>
            <span className="sidebar-text">TON Details</span>
          </Link>
          <Link to="/ton-batch-lookup"
            className={`sidebar-link ${location.pathname === '/ton-batch-lookup' ? 'active' : ''}`}>
            <span className="sidebar-icon">📋</span>
            <span className="sidebar-text">TON Safe-to-Fail</span>
          </Link>
          <Link to="/ton-seqno-check" className={`sidebar-link ${location.pathname === '/ton-seqno-check' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔢</span>
            <span className="sidebar-text">TON Seqno Check</span>
          </Link>
          <Link to="/btc-safe-to-fail"
            className={`sidebar-link ${location.pathname === '/btc-safe-to-fail' ? 'active' : ''}`}>
            <span className="sidebar-icon">₿</span>
            <span className="sidebar-text">BTC Safe-to-Fail</span>
          </Link>
          <Link to="/btc-fetcher"
            className={`sidebar-link ${location.pathname === '/btc-fetcher' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔗</span>
            <span className="sidebar-text">BTC Fetcher</span>
          </Link>
          <Link to="/csv-builder"
            className={`sidebar-link ${location.pathname === '/csv-builder' ? 'active' : ''}`}>
            <span className="sidebar-icon">📊</span>
            <span className="sidebar-text">CSV Builder</span>
          </Link>
          <Link 
            to="/faucet" 
            className={`sidebar-link ${location.pathname === '/faucet' ? 'active' : ''}`}
          >
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
          <Link to="/easy-cosigner" className={`sidebar-link ${location.pathname === '/easy-cosigner' ? 'active' : ''}`}>
            <span className="sidebar-icon">🔐</span>
            <span className="sidebar-text">Easy Cosigner</span>
          </Link>
        </div>
      </nav>

      {/* ── Main container ── */}
      <div className="btc-container">
        <div className="btc-header">
          <h1>{C.icon} {C.label} Safe-to-Fail Checker</h1>
          <p className="subtitle">
            Lookup any {C.name} transaction — check confirmation status, detect RBF replacement&nbsp;/&nbsp;double-spends,
            and inspect spent &amp; new UTXOs side-by-side from independent providers.
          </p>
        </div>

        {/* ── Chain toggle ── */}
        <div className="btc-chain-toggle">
          <button type="button" className={`chain-btn ${chain === 'btc' ? 'active' : ''}`} disabled={processing} onClick={() => handleChainChange('btc')}>₿ BTC</button>
          <button type="button" className={`chain-btn ${chain === 'ltc' ? 'active' : ''}`} disabled={processing} onClick={() => handleChainChange('ltc')}>Ł LTC</button>
        </div>

        <form onSubmit={viewMode === 'detail' ? handleSubmit : e => { e.preventDefault(); handleBatchRun() }} className="btc-form">
          {/* ── Mode toggle ── */}
          <div className="btc-mode-toggle">
            <button type="button" className={`mode-btn ${viewMode === 'detail' ? 'active' : ''}`} onClick={() => setViewMode('detail')}>🔍 Detail</button>
            <button type="button" className={`mode-btn ${viewMode === 'batch'  ? 'active' : ''}`} onClick={() => setViewMode('batch')}>📊 Batch / CSV</button>
          </div>

          <div className="form-group">
            <label htmlFor="txid-input">{C.label} Transaction ID(s) or explorer URL(s)</label>
            <textarea
              id="txid-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                chain === 'btc'
                  ? 'e.g. 4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b\nor  https://mempool.space/tx/<txid>\nPaste multiple txids on separate lines.'
                  : 'e.g. 64-character hex txid\nor  https://litecoinspace.org/tx/<txid>\nPaste multiple txids on separate lines.'
              }
              rows={viewMode === 'batch' ? 6 : 4}
              disabled={processing}
            />
            <div className="form-hint">
              {viewMode === 'batch'
                ? 'Batch mode — paste 1 000s of txids, one per line. Uses quick status check (no deep UTXO analysis). Results stream in live.'
                : `Supports raw 64-hex txids and URLs from ${C.mempoolSite.replace('https://', '')}${C.hasBlockchainCom ? ', blockchain.com' : ''}, or blockcypher.com.`}
            </div>
          </div>

          {/* ── Batch settings ── */}
          {viewMode === 'batch' && (
            <div className="batch-settings">
              <label className="batch-setting-item">
                <span>Concurrency</span>
                <select value={batchConcurrency} onChange={e => setBatchConcurrency(Number(e.target.value))} disabled={processing}>
                  <option value={1}>1 at a time</option>
                  <option value={2}>2 at a time</option>
                  <option value={3}>3 at a time</option>
                  <option value={5}>5 at a time</option>
                </select>
              </label>
              <label className="batch-setting-item">
                <span>Delay between batches</span>
                <select value={batchDelay} onChange={e => setBatchDelay(Number(e.target.value))} disabled={processing}>
                  <option value={500}>0.5 s</option>
                  <option value={1000}>1 s</option>
                  <option value={2000}>2 s</option>
                  <option value={3000}>3 s</option>
                </select>
              </label>
            </div>
          )}

          <div className="btc-form-actions">
            <button type="submit" className="submit-btn"
              disabled={processing || !input.trim()}>
              {processing
                ? viewMode === 'batch'
                  ? `⏳ ${batchProgress.current} / ${batchProgress.total}`
                  : '⏳ Analyzing…'
                : viewMode === 'batch'
                  ? `📊 Run Batch`
                  : '🔍 Analyze Transaction(s)'}
            </button>
            {processing && viewMode === 'batch' && (
              <button type="button" className="stop-btn" onClick={handleStop}>⏹ Stop</button>
            )}
          </div>
        </form>

        {/* ── Detail mode progress ── */}
        {processing && viewMode === 'detail' && (
          <div className="loading-container">
            <div className="loading-header">
              <h3>Querying providers…</h3>
              <span className="progress-text">{Math.round(progress)}%</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="loading-hint">{statusMsg || `Fetching from BlockCypher + ${C.mempoolLabel}…`}</div>
          </div>
        )}

        {/* ── Batch mode progress bar ── */}
        {processing && viewMode === 'batch' && batchProgress.total > 0 && (
          <div className="loading-container">
            <div className="loading-header">
              <h3>Running batch…</h3>
              <span className="progress-text">{batchProgress.current} / {batchProgress.total}</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
            </div>
          </div>
        )}

        {/* ── Detail mode results ── */}
        {viewMode === 'detail' && results.length > 0 && (
          <div className="btc-results">
            {results.map((r, i) => <TxResultCard key={i} result={r} chainCfg={C} />)}
          </div>
        )}

        {/* ── Batch mode results table ── */}
        {viewMode === 'batch' && batchRows.length > 0 && (
          <div className="batch-section">
            {/* Header */}
            <div className="batch-header">
              <div className="batch-summary">
                <span className="bs-total">{batchRows.length} checked</span>
                <span className="bs-confirmed">{batchRows.filter(r => r.status === 'CONFIRMED').length} confirmed</span>
                <span className="bs-replaced">{batchRows.filter(r => r.status === 'REPLACED' || r.status === 'DOUBLE_SPENT').length} replaced</span>
                <span className="bs-unconfirmed">{batchRows.filter(r => r.status === 'UNCONFIRMED').length} unconfirmed</span>
              </div>
              <button className="download-btn" onClick={downloadCSV}>⬇ CSV</button>
            </div>

            {/* Controls */}
            <div className="batch-controls">
              <div className="batch-search-wrap">
                <input
                  type="text"
                  className="batch-search"
                  placeholder="Search by hash…"
                  value={batchSearch}
                  onChange={e => { setBatchSearch(e.target.value); setBatchPage(1) }}
                />
                {batchSearch && <button className="batch-search-clear" onClick={() => setBatchSearch('')}>×</button>}
              </div>
              <select className="batch-filter" value={batchStatusFilter}
                onChange={e => { setBatchStatusFilter(e.target.value); setBatchPage(1) }}>
                <option value="all">All ({batchRows.length})</option>
                <option value="CONFIRMED">Confirmed ({batchRows.filter(r => r.status === 'CONFIRMED').length})</option>
                <option value="REPLACED">Replaced ({batchRows.filter(r => r.status === 'REPLACED' || r.status === 'DOUBLE_SPENT').length})</option>
                <option value="UNCONFIRMED">Unconfirmed ({batchRows.filter(r => r.status === 'UNCONFIRMED').length})</option>
                <option value="NOT_FOUND">Not Found ({batchRows.filter(r => r.status === 'NOT_FOUND').length})</option>
                <option value="ERROR">Error ({batchRows.filter(r => r.status === 'ERROR').length})</option>
              </select>
              <select className="batch-per-page" value={batchPerPage}
                onChange={e => { setBatchPerPage(Number(e.target.value)); setBatchPage(1) }}>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
                <option value={250}>250 / page</option>
              </select>
            </div>

            <div className="batch-info-bar">
              Showing {paginatedBatch.length} of {filteredBatch.length}
              {batchTotalPages > 1 && <span> · Page {batchPage} / {batchTotalPages}</span>}
            </div>

            {/* Table */}
            <div className="batch-table-wrap">
              <table className="batch-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Checked TX</th>
                    <th>Status</th>
                    <th>Spending TX</th>
                    <th>Block</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBatch.map(r => (
                    <tr key={r.index} className={BATCH_STATUS_COLORS[r.status] || ''}>
                      <td className="bt-idx">{r.index}</td>
                      <td className="bt-hash">
                        {r.txid
                          ? <a href={`${C.mempoolSite}/tx/${r.txid}`} target="_blank" rel="noopener noreferrer" className="hash-link">{shortHash(r.txid, 10)}</a>
                          : <span className="muted">{(r.input || '').slice(0, 20)}</span>}
                        <button className="copy-btn" title="Copy full hash" onClick={() => copyToClipboard(r.txid || r.input)}>⧉</button>
                      </td>
                      <td className="bt-status">
                        <span className={`batch-status-badge bsb-${(r.status || 'ERROR').toLowerCase()}`}>
                          {r.status === 'CONFIRMED'    ? '✓ Confirmed'
                         : r.status === 'REPLACED'    ? '↩ Replaced'
                         : r.status === 'DOUBLE_SPENT'? '⚠ Double-spent'
                         : r.status === 'UNCONFIRMED' ? '⏳ Unconfirmed'
                         : r.status === 'NOT_FOUND'   ? '✗ Not Found'
                         :                              '✗ Error'}
                        </span>
                      </td>
                      <td className="bt-spending">
                        {r.replacedBy
                          ? <a href={`${C.mempoolSite}/tx/${r.replacedBy}`} target="_blank" rel="noopener noreferrer" className="hash-link">{shortHash(r.replacedBy, 10)}</a>
                          : <span className="muted">—</span>}
                      </td>
                      <td className="bt-block">
                        {r.blockHeight ? r.blockHeight.toLocaleString() : <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {batchTotalPages > 1 && (
              <div className="batch-pagination">
                <button className="pagination-btn" disabled={batchPage === 1} onClick={() => setBatchPage(1)}>⏮</button>
                <button className="pagination-btn" disabled={batchPage === 1} onClick={() => setBatchPage(p => p - 1)}>◀</button>
                <span className="batch-page-info">{batchPage} / {batchTotalPages}</span>
                <button className="pagination-btn" disabled={batchPage === batchTotalPages} onClick={() => setBatchPage(p => p + 1)}>▶</button>
                <button className="pagination-btn" disabled={batchPage === batchTotalPages} onClick={() => setBatchPage(batchTotalPages)}>⏭</button>
              </div>
            )}
          </div>
        )}
      </div>
      <ToolInfoPanel toolId="btc-safe-to-fail" />
    </div>
  )
}

export default BtcSafeToFail
