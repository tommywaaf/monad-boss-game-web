import { useState, useEffect, useRef } from 'react'
import { trackUsage } from '../utils/counter'
import ToolInfoPanel from '../components/ToolInfoPanel'
import './CosmosCheck.css'

// CORS proxy used as a fallback when an endpoint lacks CORS headers.
// We race direct + proxied requests so the fastest reachable one wins.
const CORS_PROXY = 'https://corsproxy.io/?url='

// Per-chain endpoints:
//   - heightUrl: used to fetch the current block height (fast pruned node is fine)
//   - txLookupUrls: queried in PARALLEL. Each URL is tried both directly and through
//     the CORS proxy. The first node returning "found" wins.
//     Mix of pruned public nodes (fast path for recent txs) and archive nodes
//     (historical coverage). Archive sources: Polkachu, ecostake, numia, cosmos.directory.
const CHAIN_ENDPOINTS = {
  cosmos_mainnet: {
    label: 'Cosmos (Mainnet)',
    heightUrl: 'https://cosmos-rest.publicnode.com',
    txLookupUrls: [
      'https://cosmos-rest.publicnode.com',
      'https://lcd-cosmos.cosmostation.io',
      'https://rest.cosmos.directory/cosmoshub',
      'https://cosmos-api.polkachu.com',
      'https://rest-cosmoshub.ecostake.com',
      'https://cosmos-lcd.quickapi.com',
    ],
    explorer: 'https://www.mintscan.io/cosmos/txs/',
  },
  osmosis_mainnet: {
    label: 'Osmosis (Mainnet)',
    heightUrl: 'https://osmosis-rest.publicnode.com',
    txLookupUrls: [
      'https://osmosis-rest.publicnode.com',
      'https://lcd-osmosis.cosmostation.io',
      'https://rest.cosmos.directory/osmosis',
      'https://osmosis-api.polkachu.com',
      'https://rest.osmosis.zone',
      'https://osmosis-lcd.quickapi.com',
    ],
    explorer: 'https://www.mintscan.io/osmosis/txs/',
  },
  celestia_mainnet: {
    label: 'Celestia (Mainnet)',
    heightUrl: 'https://celestia-rest.publicnode.com',
    txLookupUrls: [
      'https://celestia-rest.publicnode.com',
      'https://rest.cosmos.directory/celestia',
      'https://public-celestia-lcd.numia.xyz',
      'https://celestia-api.polkachu.com',
      'https://api-celestia.mzonder.com',
    ],
    explorer: 'https://www.mintscan.io/celestia/txs/',
  },
  injective_mainnet: {
    label: 'Injective (Mainnet)',
    heightUrl: 'https://injective-rest.publicnode.com',
    txLookupUrls: [
      'https://injective-rest.publicnode.com',
      'https://lcd-injective.cosmostation.io',
      'https://rest.cosmos.directory/injective',
      'https://injective-api.polkachu.com',
      'https://sentry.lcd.injective.network',
    ],
    explorer: 'https://www.mintscan.io/injective/txs/',
  },
  dydx_mainnet: {
    label: 'dYdX (Mainnet)',
    heightUrl: 'https://dydx-rest.publicnode.com',
    txLookupUrls: [
      'https://dydx-rest.publicnode.com',
      'https://rest.cosmos.directory/dydx',
      'https://dydx-api.polkachu.com',
      'https://dydx-dao-api.polkachu.com',
      'https://dydx-mainnet-lcd.autostake.com',
    ],
    explorer: 'https://www.mintscan.io/dydx/txs/',
  },
  thor_mainnet: {
    label: 'THORChain (Mainnet)',
    heightUrl: 'https://thornode.ninerealms.com',
    txLookupUrls: [
      'https://thornode.ninerealms.com',
      'https://rest.cosmos.directory/thorchain',
      'https://thornode-v2.ninerealms.com',
    ],
    explorer: 'https://www.mintscan.io/thorchain/txs/',
  },
  cosmos_testnet: {
    label: 'Cosmos (Testnet)',
    heightUrl: 'https://rest.testcosmos.directory/cosmoshubtestnet',
    txLookupUrls: ['https://rest.testcosmos.directory/cosmoshubtestnet'],
    explorer: null,
  },
  osmosis_testnet: {
    label: 'Osmosis (Testnet)',
    heightUrl: 'https://rest.testcosmos.directory/osmosistestnet',
    txLookupUrls: ['https://rest.testcosmos.directory/osmosistestnet'],
    explorer: null,
  },
  celestia_testnet: {
    label: 'Celestia (Testnet)',
    heightUrl: 'https://celestia-mocha-rest.publicnode.com',
    txLookupUrls: ['https://celestia-mocha-rest.publicnode.com'],
    explorer: null,
  },
  injective_testnet: {
    label: 'Injective (Testnet)',
    heightUrl: 'https://injective-testnet-rest.publicnode.com',
    txLookupUrls: ['https://injective-testnet-rest.publicnode.com'],
    explorer: null,
  },
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

// Builds the URL that will actually be fetched. If useProxy=true we wrap the
// target URL in a public CORS proxy so the browser can reach nodes without
// CORS headers. The proxy simply forwards the GET.
function buildLookupUrl(baseUrl, txHash, useProxy) {
  const target = `${baseUrl}/cosmos/tx/v1beta1/txs/${txHash}`
  return useProxy ? `${CORS_PROXY}${encodeURIComponent(target)}` : target
}

async function checkTxAtEndpoint(baseUrl, txHash, useProxy) {
  const url = buildLookupUrl(baseUrl, txHash, useProxy)
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (res.status === 404) return { status: 'not_found' }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (text.toLowerCase().includes('not found') || text.toLowerCase().includes('tx not found')) {
      return { status: 'not_found' }
    }
    throw new Error(`HTTP ${res.status}`)
  }
  const data = await res.json().catch(() => null)
  if (!data) throw new Error('Invalid JSON response')
  const txr = data?.tx_response
  if (!txr) {
    // Some nodes return 200 with an error message body
    if (data?.code === 5 || (typeof data?.message === 'string' && data.message.toLowerCase().includes('not found'))) {
      return { status: 'not_found' }
    }
    throw new Error('Unexpected response shape')
  }
  return {
    status: 'found',
    code: Number(txr.code ?? 0),
    height: parseInt(txr.height, 10),
    hash: txr.txhash,
    foundAt: baseUrl,
    viaProxy: useProxy,
  }
}

// Looks up the TX across ALL endpoints in parallel, racing both the direct URL
// and the CORS-proxied URL for each endpoint. Returns as soon as any endpoint
// returns "found". Only returns "not_found" if ALL endpoints agree.
async function checkTxOnChain(txLookupUrls, txHash) {
  const attempts = []
  for (const url of txLookupUrls) {
    attempts.push({ url, useProxy: false })
    attempts.push({ url, useProxy: true })
  }

  const outcomes = new Array(attempts.length)
  let resolvedFound = null
  let remaining = attempts.length

  return new Promise((resolve) => {
    attempts.forEach((a, idx) => {
      checkTxAtEndpoint(a.url, txHash, a.useProxy)
        .then(r => { outcomes[idx] = r })
        .catch(err => { outcomes[idx] = { status: 'error', error: err.message, url: a.url, viaProxy: a.useProxy } })
        .finally(() => {
          const latest = outcomes[idx]
          if (!resolvedFound && latest?.status === 'found') {
            resolvedFound = latest
            resolve(latest)
            return
          }
          remaining -= 1
          if (remaining === 0 && !resolvedFound) {
            const notFoundCount = outcomes.filter(o => o?.status === 'not_found').length
            const errorCount = outcomes.filter(o => o?.status === 'error').length
            resolve({
              status: 'not_found',
              uniqueEndpointsTried: txLookupUrls.length,
              notFoundCount,
              errorCount,
              errors: outcomes.filter(o => o?.status === 'error').map(o => `${o.url}${o.viaProxy ? ' (via proxy)' : ''}: ${o.error}`),
            })
          }
        })
    })
  })
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
    const heightResult = await fetchBlockHeight(chainConfig.heightUrl).then(
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

        const onChain = await checkTxOnChain(chainConfig.txLookupUrls, txHash).catch(err => ({
          status: 'error',
          error: err.message || String(err),
        }))

        let verdict, safeToFail, onChainLabel, requiresManualCheck = false

        if (onChain.status === 'found') {
          // TX is already on-chain — never safe to fail regardless of timeout
          safeToFail = false
          const execStatus = onChain.code === 0 ? 'succeeded' : `failed on-chain (code ${onChain.code})`
          const foundAtHost = onChain.foundAt.replace(/^https?:\/\//, '')
          onChainLabel = `Yes — ${execStatus} at block ${onChain.height?.toLocaleString() ?? '?'}`
          verdict = `Transaction confirmed on-chain at block ${onChain.height?.toLocaleString() ?? '?'} (${execStatus}) — found on ${foundAtHost}${onChain.viaProxy ? ' via CORS proxy' : ''}. It has already been processed and is NOT safe to fail.`
        } else if (onChain.status === 'not_found') {
          const n = onChain.uniqueEndpointsTried ?? 1
          onChainLabel = `Not found (checked ${n} node${n !== 1 ? 's' : ''})`

          // For TXs whose timeout height is VERY far in the past, not-found
          // from pruned nodes is ambiguous — even archive nodes don't all go back forever.
          // We flag it so the user can verify on Mintscan.
          const blocksPast = currentHeight - Number(timeoutHeight)
          const isVeryOld = timeoutHeight > 0 && blocksPast > 100_000

          if (timeoutHeight === 0) {
            verdict = 'No timeout height set (timeoutHeight = 0) — not found on-chain. Cannot determine safety.'
            safeToFail = null
            requiresManualCheck = true
          } else if (timeoutHeight > currentHeight) {
            const delta = timeoutHeight - currentHeight
            verdict = `Not on-chain. Timeout height ${timeoutHeight.toLocaleString()} is ${delta.toLocaleString()} block${delta !== 1 ? 's' : ''} in the future.`
            safeToFail = false
          } else if (timeoutHeight === currentHeight) {
            verdict = `Not on-chain. Timeout height ${timeoutHeight.toLocaleString()} equals current height — transaction is expiring now.`
            safeToFail = false
          } else if (isVeryOld) {
            const days = Math.round(blocksPast / 14400) // ~6s block times -> ~14,400 blocks/day
            verdict = `Timeout height ${timeoutHeight.toLocaleString()} is ${blocksPast.toLocaleString()} blocks in the past (~${days} day${days !== 1 ? 's' : ''} ago). TX was not found on any queried node, but public archives may not retain data this far back. VERIFY MANUALLY on Mintscan before failing.`
            safeToFail = null
            requiresManualCheck = true
          } else {
            const delta = currentHeight - timeoutHeight
            verdict = `Not on-chain. Timeout height ${timeoutHeight.toLocaleString()} is ${delta.toLocaleString()} block${delta !== 1 ? 's' : ''} in the past — transaction has expired.`
            safeToFail = true
          }
        } else {
          onChainLabel = `Unknown (${onChain.error})`
          verdict = `Could not determine on-chain status: ${onChain.error}. Please verify manually on Mintscan.`
          safeToFail = null
          requiresManualCheck = true
        }

        newResults.push({
          rawTx,
          success: true,
          chain: chainConfig.label,
          explorer: chainConfig.explorer,
          txHash,
          timeoutHeight,
          currentHeight,
          onChainStatus: onChain.status,
          onChainLabel,
          verdict,
          safeToFail,
          requiresManualCheck,
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
                          result.onChainStatus === 'found' ? 'cosmos-onchain-yes' :
                          result.onChainStatus === 'not_found' ? 'cosmos-onchain-no' : 'cosmos-zero'
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

                    {result.requiresManualCheck && result.explorer && (
                      <a
                        href={`${result.explorer}${result.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cosmos-mintscan-btn"
                      >
                        ↗ Verify on Mintscan
                      </a>
                    )}
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
