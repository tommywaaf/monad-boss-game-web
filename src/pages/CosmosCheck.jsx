import { useState, useEffect, useRef } from 'react'
import { trackUsage } from '../utils/counter'
import ToolInfoPanel from '../components/ToolInfoPanel'
import './CosmosCheck.css'

const CHAIN_ENDPOINTS = {
  cosmos_mainnet:    { label: 'Cosmos (Mainnet)',     url: 'https://cosmos-rest.publicnode.com',            explorer: 'https://www.mintscan.io/cosmos/txs/' },
  osmosis_mainnet:   { label: 'Osmosis (Mainnet)',    url: 'https://osmosis-rest.publicnode.com',           explorer: 'https://www.mintscan.io/osmosis/txs/' },
  celestia_mainnet:  { label: 'Celestia (Mainnet)',   url: 'https://celestia-rest.publicnode.com',          explorer: 'https://www.mintscan.io/celestia/txs/' },
  injective_mainnet: { label: 'Injective (Mainnet)',  url: 'https://injective-rest.publicnode.com',         explorer: 'https://www.mintscan.io/injective/txs/' },
  dydx_mainnet:      { label: 'dYdX (Mainnet)',       url: 'https://dydx-rest.publicnode.com',              explorer: 'https://www.mintscan.io/dydx/txs/' },
  cosmos_testnet:    { label: 'Cosmos (Testnet)',     url: 'https://rest.testcosmos.directory/cosmoshubtestnet', explorer: null },
  osmosis_testnet:   { label: 'Osmosis (Testnet)',    url: 'https://rest.testcosmos.directory/osmosistestnet',  explorer: null },
  celestia_testnet:  { label: 'Celestia (Testnet)',   url: 'https://celestia-mocha-rest.publicnode.com',    explorer: null },
  injective_testnet: { label: 'Injective (Testnet)',  url: 'https://injective-testnet-rest.publicnode.com', explorer: null },
}

// ─── Minimal in-browser protobuf parser ──────────────────────────────────────
// Cosmos Tx proto structure:
//   Tx.body               = field 1, wire type 2 (length-delimited)
//   TxBody.timeout_height = field 3, wire type 0 (varint)

function readVarint(bytes, pos) {
  let result = 0
  let shift = 0
  while (pos < bytes.length) {
    const byte = bytes[pos++]
    result |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) break
    shift += 7
  }
  return { value: result >>> 0, pos }
}

function parseFields(bytes) {
  const fields = {}
  let pos = 0
  while (pos < bytes.length) {
    if (pos >= bytes.length) break
    const { value: tag, pos: p1 } = readVarint(bytes, pos)
    pos = p1
    const fieldNum = tag >>> 3
    const wireType = tag & 0x7

    if (wireType === 0) {
      const { value, pos: p2 } = readVarint(bytes, pos)
      pos = p2
      if (!fields[fieldNum]) fields[fieldNum] = []
      fields[fieldNum].push(value)
    } else if (wireType === 2) {
      const { value: len, pos: p2 } = readVarint(bytes, pos)
      pos = p2
      const data = bytes.slice(pos, pos + len)
      pos += len
      if (!fields[fieldNum]) fields[fieldNum] = []
      fields[fieldNum].push(data)
    } else if (wireType === 1) {
      pos += 8
    } else if (wireType === 5) {
      pos += 4
    } else {
      break
    }
  }
  return fields
}

function base64ToBytes(base64Tx) {
  const normalized = base64Tx.trim().replace(/-/g, '+').replace(/_/g, '/')
  let binary
  try {
    binary = atob(normalized)
  } catch {
    throw new Error('Invalid base64 — could not decode the raw transaction.')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function extractTimeoutHeight(txBytes) {
  // Parse outer Tx: field 1 = TxBody
  const txFields = parseFields(txBytes)
  if (!txFields[1] || txFields[1].length === 0) {
    throw new Error('Could not find TxBody in transaction. Is this a valid Cosmos raw TX?')
  }
  // Parse TxBody: field 3 = timeout_height (uint64)
  const bodyFields = parseFields(txFields[1][0])
  return bodyFields[3] ? bodyFields[3][0] : 0
}

async function computeTxHash(txBytes) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', txBytes)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

// ─── Chain REST API ──────────────────────────────────────────────────────────

async function fetchBlockHeight(endpointUrl) {
  const res = await fetch(
    `${endpointUrl}/cosmos/base/tendermint/v1beta1/blocks/latest`,
    { signal: AbortSignal.timeout(15000) }
  )
  if (!res.ok) throw new Error(`Chain RPC returned HTTP ${res.status}`)
  const data = await res.json()
  const height = parseInt(data?.block?.header?.height, 10)
  if (!height || isNaN(height)) throw new Error('Unexpected response format from chain endpoint')
  return height
}

async function checkTxOnChain(endpointUrl, txHash) {
  const res = await fetch(
    `${endpointUrl}/cosmos/tx/v1beta1/txs/${txHash}`,
    { signal: AbortSignal.timeout(15000) }
  )
  if (res.status === 404) return { found: false }
  if (!res.ok) {
    // Some nodes return 400/500 with a "not found" body instead of 404
    const text = await res.text().catch(() => '')
    if (text.toLowerCase().includes('not found')) return { found: false }
    throw new Error(`HTTP ${res.status} checking on-chain status`)
  }
  const data = await res.json()
  const txr = data?.tx_response
  if (!txr) return { found: false }
  return {
    found: true,
    code: Number(txr.code ?? 0),
    height: parseInt(txr.height, 10),
    hash: txr.txhash,
  }
}

// ─── Main component ─────────────────────────────────────────────────────────

function CosmosCheck() {
  useEffect(() => {
    document.title = 'Cosmos TX Check'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  const [input, setInput] = useState('')
  const [chain, setChain] = useState('cosmos_mainnet')
  const [results, setResults] = useState([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const progressRef = useRef(null)

  useEffect(() => {
    if (processing) {
      setProgress(0)
      const start = Date.now()
      const duration = 5000
      progressRef.current = setInterval(() => {
        const pct = Math.min(((Date.now() - start) / duration) * 100, 95)
        setProgress(pct)
        if (pct >= 95) clearInterval(progressRef.current)
      }, 50)
    } else {
      if (progressRef.current) {
        clearInterval(progressRef.current)
        progressRef.current = null
      }
      setProgress(0)
    }
    return () => { if (progressRef.current) clearInterval(progressRef.current) }
  }, [processing])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const lines = input.trim().split(/\n+/).map(l => l.trim()).filter(Boolean)
    trackUsage('cosmos-check', lines.length)
    setProcessing(true)
    setResults([])

    const chainConfig = CHAIN_ENDPOINTS[chain]

    // Fetch current block height once, shared across all TXes
    const heightResult = await fetchBlockHeight(chainConfig.url).then(
      h => ({ ok: true, value: h }),
      err => ({ ok: false, error: err.message || String(err) })
    )

    const newResults = []

    for (const rawTx of lines) {
      if (!heightResult.ok) {
        newResults.push({ rawTx, success: false, error: `Failed to fetch current block height: ${heightResult.error}` })
        continue
      }

      const currentHeight = heightResult.value

      try {
        const txBytes = base64ToBytes(rawTx)
        const [timeoutHeight, txHash] = await Promise.all([
          Promise.resolve(extractTimeoutHeight(txBytes)),
          computeTxHash(txBytes),
        ])

        // On-chain check runs concurrently with nothing else here but is awaited before verdict
        const onChain = await checkTxOnChain(chainConfig.url, txHash).catch(err => ({
          found: null,
          error: err.message || String(err),
        }))

        let verdict, safeToFail, onChainLabel

        if (onChain.found === true) {
          // TX is already on-chain — never safe to fail regardless of timeout
          safeToFail = false
          const execStatus = onChain.code === 0 ? 'succeeded' : `failed on-chain (code ${onChain.code})`
          onChainLabel = `Yes — ${execStatus} at block ${onChain.height?.toLocaleString() ?? '?'}`
          verdict = `Transaction is confirmed on-chain at block ${onChain.height?.toLocaleString() ?? '?'} (${execStatus}). It has already been processed and is NOT safe to fail.`
        } else {
          onChainLabel = onChain.found === false
            ? 'Not found'
            : `Unknown (${onChain.error})`

          if (timeoutHeight === 0) {
            verdict = 'No timeout height set (timeoutHeight = 0) — not found on-chain. Cannot determine safety.'
            safeToFail = null
          } else if (timeoutHeight > currentHeight) {
            const delta = timeoutHeight - currentHeight
            verdict = `Not on-chain. Timeout height ${timeoutHeight.toLocaleString()} is ${delta.toLocaleString()} block${delta !== 1 ? 's' : ''} in the future.`
            safeToFail = false
          } else if (timeoutHeight === currentHeight) {
            verdict = `Not on-chain. Timeout height ${timeoutHeight.toLocaleString()} equals current height — transaction is expiring now.`
            safeToFail = false
          } else {
            const delta = currentHeight - timeoutHeight
            verdict = `Not on-chain. Timeout height ${timeoutHeight.toLocaleString()} is ${delta.toLocaleString()} block${delta !== 1 ? 's' : ''} in the past — transaction has expired.`
            safeToFail = true
          }
        }

        newResults.push({
          rawTx,
          success: true,
          chain: chainConfig.label,
          explorer: chainConfig.explorer,
          txHash,
          timeoutHeight,
          currentHeight,
          onChainFound: onChain.found,
          onChainLabel,
          verdict,
          safeToFail,
        })
      } catch (err) {
        newResults.push({ rawTx, success: false, error: err.message || String(err) })
      }
    }

    setProgress(100)
    await new Promise(r => setTimeout(r, 200))
    setResults(newResults)
    setProcessing(false)
  }

  return (
    <div className="cosmos-check-page">
      <div className="cosmos-check-container">
        <div className="cosmos-check-header">
          <h1>⚛️ Cosmos TX Check</h1>
          <p className="subtitle">Check if a Cosmos ecosystem transaction is on-chain or safe to fail based on its timeout height</p>
        </div>

        <form onSubmit={handleSubmit} className="cosmos-check-form">
          <div className="form-group">
            <label htmlFor="chain-select">Chain</label>
            <select
              id="chain-select"
              value={chain}
              onChange={e => setChain(e.target.value)}
              disabled={processing}
              className="cosmos-chain-select"
            >
              <optgroup label="Mainnet">
                {Object.entries(CHAIN_ENDPOINTS)
                  .filter(([k]) => k.endsWith('_mainnet'))
                  .map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
              </optgroup>
              <optgroup label="Testnet">
                {Object.entries(CHAIN_ENDPOINTS)
                  .filter(([k]) => k.endsWith('_testnet'))
                  .map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
              </optgroup>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="tx-input">Base64 Raw Transaction(s)</label>
            <textarea
              id="tx-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={'Paste base64-encoded raw TX here (one per line)\nExample: CpkBCpEB...'}
              rows={5}
              disabled={processing}
            />
            <div className="form-hint">
              Copy the base64 value from Coralogix after &quot;About to send &lt;ASSET_ID&gt; tx=&quot; — one TX per line
            </div>
          </div>

          <button
            type="submit"
            className="submit-btn"
            disabled={processing || !input.trim()}
          >
            {processing ? 'Checking...' : 'Check Transaction'}
          </button>
        </form>

        {processing && (
          <div className="loading-container">
            <div className="loading-header">
              <h3>Fetching chain data...</h3>
              <div className="progress-text">{Math.round(progress)}%</div>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar cosmos-progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="loading-hint">
              Querying {CHAIN_ENDPOINTS[chain].label} — checking block height and on-chain status...
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="results-container">
            {results.map((result, idx) => (
              <div
                key={idx}
                className={`result-card ${
                  !result.success ? 'error' :
                  result.safeToFail === true ? 'cosmos-safe' :
                  result.safeToFail === false ? 'cosmos-unsafe' :
                  'cosmos-unknown'
                }`}
              >
                <div className="result-header">
                  <div className="cosmos-verdict-badge-row">
                    {result.success ? (
                      result.safeToFail === true ? (
                        <span className="cosmos-verdict-badge safe">✓ SAFE TO FAIL</span>
                      ) : result.safeToFail === false ? (
                        <span className="cosmos-verdict-badge unsafe">✗ NOT SAFE TO FAIL</span>
                      ) : (
                        <span className="cosmos-verdict-badge unknown">? UNKNOWN</span>
                      )
                    ) : (
                      <span className="cosmos-verdict-badge error-badge">✗ ERROR</span>
                    )}
                  </div>
                  <div className="result-input">
                    <strong>TX:</strong> <span className="cosmos-tx-preview">{result.rawTx.length > 60 ? result.rawTx.slice(0, 60) + '…' : result.rawTx}</span>
                  </div>
                </div>

                {result.success ? (
                  <div className="result-content">
                    <div className="cosmos-result-grid">
                      <div className="cosmos-stat">
                        <span className="field-label">Chain</span>
                        <span className="field-value">{result.chain}</span>
                      </div>
                      <div className="cosmos-stat">
                        <span className="field-label">On-Chain</span>
                        <span className={`field-value cosmos-onchain-value ${
                          result.onChainFound === true ? 'cosmos-onchain-yes' :
                          result.onChainFound === false ? 'cosmos-onchain-no' : 'cosmos-zero'
                        }`}>
                          {result.onChainLabel}
                        </span>
                      </div>
                      <div className="cosmos-stat">
                        <span className="field-label">Timeout Height</span>
                        <span className={`field-value cosmos-height-value ${result.timeoutHeight === 0 ? 'cosmos-zero' : ''}`}>
                          {result.timeoutHeight === 0 ? 'Not set (0)' : result.timeoutHeight.toLocaleString()}
                        </span>
                      </div>
                      <div className="cosmos-stat">
                        <span className="field-label">Current Height</span>
                        <span className="field-value">{result.currentHeight.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="cosmos-tx-hash-row">
                      <span className="field-label">TX Hash</span>
                      <span className="cosmos-tx-hash-value">
                        {result.explorer ? (
                          <a
                            href={`${result.explorer}${result.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cosmos-explorer-link"
                          >
                            {result.txHash}
                          </a>
                        ) : (
                          result.txHash
                        )}
                      </span>
                    </div>

                    <div className={`cosmos-verdict-text ${
                      result.safeToFail === true ? 'safe' :
                      result.safeToFail === false ? 'unsafe' : 'unknown'
                    }`}>
                      {result.verdict}
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
      <ToolInfoPanel toolId="cosmos-check" />
    </div>
  )
}

export default CosmosCheck
