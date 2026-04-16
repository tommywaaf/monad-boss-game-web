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
    label: 'Cosmos Hub (Mainnet)',
    fireblocksId: 'ATOM_COS',
    fireblocksRescanSupported: true,
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
    bech32Prefix: 'cosmos',
  },
  osmosis_mainnet: {
    label: 'Osmosis (Mainnet)',
    fireblocksId: 'OSMO',
    fireblocksRescanSupported: true,
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
    bech32Prefix: 'osmo',
  },
  celestia_mainnet: {
    label: 'Celestia (Mainnet)',
    fireblocksId: 'CELESTIA',
    fireblocksRescanSupported: true,
    heightUrl: 'https://celestia-rest.publicnode.com',
    txLookupUrls: [
      'https://celestia-rest.publicnode.com',
      'https://rest.cosmos.directory/celestia',
      'https://public-celestia-lcd.numia.xyz',
      'https://celestia-api.polkachu.com',
      'https://api-celestia.mzonder.com',
    ],
    explorer: 'https://www.mintscan.io/celestia/txs/',
    bech32Prefix: 'celestia',
  },
  injective_mainnet: {
    label: 'Injective (Mainnet)',
    fireblocksId: 'INJ_INJ',
    heightUrl: 'https://injective-rest.publicnode.com',
    txLookupUrls: [
      'https://injective-rest.publicnode.com',
      'https://lcd-injective.cosmostation.io',
      'https://rest.cosmos.directory/injective',
      'https://injective-api.polkachu.com',
      'https://sentry.lcd.injective.network',
    ],
    explorer: 'https://www.mintscan.io/injective/txs/',
    bech32Prefix: 'inj',
  },
  dydx_mainnet: {
    label: 'dYdX (Mainnet)',
    fireblocksId: 'DYDX_DYDX',
    fireblocksRescanSupported: true,
    heightUrl: 'https://dydx-rest.publicnode.com',
    txLookupUrls: [
      'https://dydx-rest.publicnode.com',
      'https://rest.cosmos.directory/dydx',
      'https://dydx-api.polkachu.com',
      'https://dydx-dao-api.polkachu.com',
      'https://dydx-mainnet-lcd.autostake.com',
    ],
    explorer: 'https://www.mintscan.io/dydx/txs/',
    bech32Prefix: 'dydx',
  },
  thor_mainnet: {
    label: 'THORChain (Mainnet)',
    fireblocksId: 'RUNE_THOR',
    fireblocksRescanSupported: true,
    // Note: thornode.ninerealms.com does a 301 to liquify gateway which breaks
    // cross-origin redirects in the browser. Use cosmos.directory as primary.
    heightUrl: 'https://rest.cosmos.directory/thorchain',
    txLookupUrls: [
      'https://rest.cosmos.directory/thorchain',
      'https://thornode.ninerealms.com',
      'https://thornode-v2.ninerealms.com',
    ],
    explorer: 'https://www.mintscan.io/thorchain/txs/',
    bech32Prefix: 'thor',
  },
  kava_mainnet: {
    label: 'Kava (Mainnet)',
    heightUrl: 'https://kava-rest.publicnode.com',
    txLookupUrls: [
      'https://kava-rest.publicnode.com',
      'https://lcd-kava.cosmostation.io',
      'https://rest.cosmos.directory/kava',
      'https://kava-api.polkachu.com',
    ],
    explorer: 'https://www.mintscan.io/kava/txs/',
    bech32Prefix: 'kava',
  },
  axelar_mainnet: {
    label: 'Axelar (Mainnet)',
    fireblocksId: 'AXL',
    fireblocksRescanSupported: true,
    heightUrl: 'https://axelar-rest.publicnode.com',
    txLookupUrls: [
      'https://axelar-rest.publicnode.com',
      'https://lcd-axelar.cosmostation.io',
      'https://rest.cosmos.directory/axelar',
      'https://axelar-api.polkachu.com',
    ],
    explorer: 'https://www.mintscan.io/axelar/txs/',
    bech32Prefix: 'axelar',
  },
  noble_mainnet: {
    label: 'Noble (Mainnet)',
    heightUrl: 'https://noble-api.polkachu.com',
    txLookupUrls: [
      'https://noble-api.polkachu.com',
      'https://rest.cosmos.directory/noble',
      'https://lcd-noble.cosmostation.io',
    ],
    explorer: 'https://www.mintscan.io/noble/txs/',
    bech32Prefix: 'noble',
  },
  kujira_mainnet: {
    label: 'Kujira (Mainnet)',
    heightUrl: 'https://kujira-rest.publicnode.com',
    txLookupUrls: [
      'https://kujira-rest.publicnode.com',
      'https://lcd-kujira.cosmostation.io',
      'https://rest.cosmos.directory/kujira',
      'https://kujira-api.polkachu.com',
    ],
    explorer: 'https://www.mintscan.io/kujira/txs/',
    bech32Prefix: 'kujira',
  },
  stargaze_mainnet: {
    label: 'Stargaze (Mainnet)',
    heightUrl: 'https://stargaze-rest.publicnode.com',
    txLookupUrls: [
      'https://stargaze-rest.publicnode.com',
      'https://lcd-stargaze.cosmostation.io',
      'https://rest.cosmos.directory/stargaze',
      'https://stargaze-api.polkachu.com',
    ],
    explorer: 'https://www.mintscan.io/stargaze/txs/',
    bech32Prefix: 'stars',
  },
  stride_mainnet: {
    label: 'Stride (Mainnet)',
    heightUrl: 'https://stride-rest.publicnode.com',
    txLookupUrls: [
      'https://stride-rest.publicnode.com',
      'https://lcd-stride.cosmostation.io',
      'https://rest.cosmos.directory/stride',
      'https://stride-api.polkachu.com',
    ],
    explorer: 'https://www.mintscan.io/stride/txs/',
    bech32Prefix: 'stride',
  },
  sei_mainnet: {
    label: 'Sei (Mainnet)',
    heightUrl: 'https://sei-rest.publicnode.com',
    txLookupUrls: [
      'https://sei-rest.publicnode.com',
      'https://lcd-sei.cosmostation.io',
      'https://rest.cosmos.directory/sei',
      'https://sei-api.polkachu.com',
    ],
    explorer: 'https://www.mintscan.io/sei/txs/',
    bech32Prefix: 'sei',
  },
  neutron_mainnet: {
    label: 'Neutron (Mainnet)',
    heightUrl: 'https://neutron-rest.publicnode.com',
    txLookupUrls: [
      'https://neutron-rest.publicnode.com',
      'https://lcd-neutron.cosmostation.io',
      'https://rest.cosmos.directory/neutron',
      'https://neutron-api.polkachu.com',
    ],
    explorer: 'https://www.mintscan.io/neutron/txs/',
    bech32Prefix: 'neutron',
  },
  akash_mainnet: {
    label: 'Akash (Mainnet)',
    heightUrl: 'https://akash-rest.publicnode.com',
    txLookupUrls: [
      'https://akash-rest.publicnode.com',
      'https://lcd-akash.cosmostation.io',
      'https://rest.cosmos.directory/akash',
      'https://akash-api.polkachu.com',
    ],
    explorer: 'https://www.mintscan.io/akash/txs/',
    bech32Prefix: 'akash',
  },
  juno_mainnet: {
    label: 'Juno (Mainnet)',
    heightUrl: 'https://juno-rest.publicnode.com',
    txLookupUrls: [
      'https://juno-rest.publicnode.com',
      'https://rest.cosmos.directory/juno',
      'https://juno-api.polkachu.com',
    ],
    explorer: 'https://www.mintscan.io/juno/txs/',
    bech32Prefix: 'juno',
  },
  persistence_mainnet: {
    label: 'Persistence (Mainnet)',
    heightUrl: 'https://persistence-rest.publicnode.com',
    txLookupUrls: [
      'https://persistence-rest.publicnode.com',
      'https://lcd-persistence.cosmostation.io',
      'https://rest.cosmos.directory/persistence',
      'https://persistence-api.polkachu.com',
    ],
    explorer: 'https://www.mintscan.io/persistence/txs/',
    bech32Prefix: 'persistence',
  },
  mantra_mainnet: {
    label: 'MANTRA (Mainnet)',
    // publicnode returns 403; use cosmos.directory + Polkachu
    heightUrl: 'https://rest.cosmos.directory/mantrachain',
    txLookupUrls: [
      'https://rest.cosmos.directory/mantrachain',
      'https://mantra-api.polkachu.com',
      'https://lcd-mantra.cosmostation.io',
    ],
    explorer: 'https://www.mintscan.io/mantra/txs/',
    bech32Prefix: 'mantra',
  },
  zigchain_mainnet: {
    label: 'ZIGChain (Mainnet)',
    heightUrl: 'https://rest.cosmos.directory/zigchain',
    txLookupUrls: [
      'https://rest.cosmos.directory/zigchain',
      'https://zigchain-api.polkachu.com',
    ],
    explorer: 'https://www.mintscan.io/zigchain/txs/',
    bech32Prefix: 'zig',
  },
  initia_mainnet: {
    label: 'Initia (Mainnet)',
    heightUrl: 'https://rest.initia.xyz',
    txLookupUrls: [
      'https://rest.initia.xyz',
      'https://rest.cosmos.directory/initia',
      'https://initia-api.polkachu.com',
    ],
    explorer: 'https://scan.initia.xyz/initia-1/txs/',
    bech32Prefix: 'init',
  },
  babylon_mainnet: {
    label: 'Babylon (Mainnet)',
    heightUrl: 'https://babylon-rest.publicnode.com',
    txLookupUrls: [
      'https://babylon-rest.publicnode.com',
      'https://rest.cosmos.directory/babylon',
      'https://babylon-api.polkachu.com',
    ],
    explorer: 'https://www.mintscan.io/babylon/txs/',
    bech32Prefix: 'bbn',
  },
  cosmos_testnet: {
    label: 'Cosmos Hub (Testnet)',
    fireblocksId: 'ATOM_COS_TEST',
    fireblocksRescanSupported: true,
    heightUrl: 'https://rest.testcosmos.directory/cosmoshubtestnet',
    txLookupUrls: ['https://rest.testcosmos.directory/cosmoshubtestnet'],
    explorer: null,
    bech32Prefix: 'cosmos',
  },
  osmosis_testnet: {
    label: 'Osmosis (Testnet)',
    heightUrl: 'https://rest.testcosmos.directory/osmosistestnet',
    txLookupUrls: ['https://rest.testcosmos.directory/osmosistestnet'],
    explorer: null,
    bech32Prefix: 'osmo',
  },
  celestia_testnet: {
    label: 'Celestia (Testnet)',
    fireblocksId: 'CELESTIA_TEST',
    fireblocksRescanSupported: true,
    heightUrl: 'https://celestia-mocha-rest.publicnode.com',
    txLookupUrls: ['https://celestia-mocha-rest.publicnode.com'],
    explorer: null,
    bech32Prefix: 'celestia',
  },
  injective_testnet: {
    label: 'Injective (Testnet)',
    heightUrl: 'https://injective-testnet-rest.publicnode.com',
    txLookupUrls: ['https://injective-testnet-rest.publicnode.com'],
    explorer: null,
    bech32Prefix: 'inj',
  },
}

// Maps a bech32 HRP (human-readable prefix) to the nicest chain key to suggest.
// Keys are the prefix as found in the TX; values are the chain key in CHAIN_ENDPOINTS.
const PREFIX_TO_CHAIN = {
  cosmos: 'cosmos_mainnet',
  osmo: 'osmosis_mainnet',
  celestia: 'celestia_mainnet',
  inj: 'injective_mainnet',
  dydx: 'dydx_mainnet',
  thor: 'thor_mainnet',
  kava: 'kava_mainnet',
  axelar: 'axelar_mainnet',
  noble: 'noble_mainnet',
  kujira: 'kujira_mainnet',
  stars: 'stargaze_mainnet',
  stride: 'stride_mainnet',
  sei: 'sei_mainnet',
  neutron: 'neutron_mainnet',
  akash: 'akash_mainnet',
  juno: 'juno_mainnet',
  persistence: 'persistence_mainnet',
  mantra: 'mantra_mainnet',
  zig: 'zigchain_mainnet',
  init: 'initia_mainnet',
  bbn: 'babylon_mainnet',
}

// TypeURL fragments that uniquely identify a chain family (when the bech32
// prefix alone isn't enough). THORChain's `/types.Msg*` is its tell-tale sign.
const TYPE_URL_HINTS = [
  { pattern: /^\/types\.Msg(Send|Deposit|ObservedTx|Swap|Outbound)/, chain: 'thor_mainnet' },
  { pattern: /^\/injective\./, chain: 'injective_mainnet' },
  { pattern: /^\/osmosis\./, chain: 'osmosis_mainnet' },
  { pattern: /^\/celestia\./, chain: 'celestia_mainnet' },
  { pattern: /^\/dydx(protocol)?\./, chain: 'dydx_mainnet' },
]

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

// Extracts all message type URLs from TxBody.messages[].type_url.
// E.g. "/cosmos.bank.v1beta1.MsgSend" (generic) or "/types.MsgSend" (THORChain).
function extractTypeUrls(txBytes) {
  const txFields = parseFields(txBytes)
  if (!txFields[1] || txFields[1].length === 0) return []
  const bodyFields = parseFields(txFields[1][0])
  if (!bodyFields[1]) return []
  const typeUrls = []
  const decoder = new TextDecoder()
  for (const msgBytes of bodyFields[1]) {
    const msgFields = parseFields(msgBytes)
    if (msgFields[1] && msgFields[1][0]) {
      try { typeUrls.push(decoder.decode(msgFields[1][0])) } catch { /* skip */ }
    }
  }
  return typeUrls
}

// Scans the TX bytes (interpreted as latin1 text) for bech32-style addresses
// and returns the set of unique HRPs (e.g. "cosmos", "thor", "osmo"). Used to
// detect what chain the TX was built for.
function extractBech32Prefixes(txBytes) {
  const text = new TextDecoder('latin1').decode(txBytes)
  // bech32: HRP (lowercase letters) + "1" + data chars (a-z0-9 minus b,i,o,1)
  const re = /([a-z]{2,16})1[023456789acdefghjklmnpqrstuvwxyz]{30,90}/g
  const prefixes = new Set()
  let m
  while ((m = re.exec(text)) !== null) {
    prefixes.add(m[1])
  }
  return prefixes
}

// Returns the most likely chain key for this TX based on address prefixes and
// typeURL hints, or null if we can't tell.
function detectChain(txBytes) {
  const typeUrls = extractTypeUrls(txBytes)
  for (const url of typeUrls) {
    for (const hint of TYPE_URL_HINTS) {
      if (hint.pattern.test(url)) return { chain: hint.chain, reason: `type URL "${url}"` }
    }
  }
  const prefixes = extractBech32Prefixes(txBytes)
  for (const prefix of prefixes) {
    if (PREFIX_TO_CHAIN[prefix]) {
      return { chain: PREFIX_TO_CHAIN[prefix], reason: `address prefix "${prefix}1..."` }
    }
  }
  return null
}

async function computeTxHash(txBytes) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', txBytes)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

// ─── Chain REST API ──────────────────────────────────────────────────────────

async function fetchBlockHeightFrom(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const height = parseInt(data?.block?.header?.height, 10)
  if (!height || isNaN(height)) throw new Error('Unexpected response format')
  return height
}

// Tries direct first; on any failure (CORS, redirect, network) falls back to
// the CORS proxy. This covers endpoints that redirect cross-origin (e.g.
// thornode.ninerealms.com → gateway.liquify.com) which browsers block.
async function fetchBlockHeight(endpointUrl) {
  const target = `${endpointUrl}/cosmos/base/tendermint/v1beta1/blocks/latest`
  try {
    return await fetchBlockHeightFrom(target)
  } catch (directErr) {
    try {
      return await fetchBlockHeightFrom(`${CORS_PROXY}${encodeURIComponent(target)}`)
    } catch {
      // Preserve the original error — it's more useful than the proxy's
      throw directErr
    }
  }
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

        // Detect likely chain from addresses + typeURLs, compare to selection
        const detected = detectChain(txBytes)
        const chainMismatch = detected && detected.chain !== chain
          ? {
              detectedChain: detected.chain,
              detectedLabel: CHAIN_ENDPOINTS[detected.chain]?.label ?? detected.chain,
              reason: detected.reason,
            }
          : null

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
          fireblocksId: chainConfig.fireblocksId ?? null,
          explorer: chainConfig.explorer,
          txHash,
          timeoutHeight,
          currentHeight,
          onChainStatus: onChain.status,
          onChainLabel,
          verdict,
          safeToFail,
          requiresManualCheck,
          chainMismatch,
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
              <optgroup label="⭐ Fireblocks Rescan Supported (Mainnet)">
                {Object.entries(CHAIN_ENDPOINTS)
                  .filter(([k, cfg]) => k.endsWith('_mainnet') && cfg.fireblocksRescanSupported)
                  .map(([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.label}{cfg.fireblocksId ? ` — ${cfg.fireblocksId}` : ''}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Other Cosmos Chains (Mainnet)">
                {Object.entries(CHAIN_ENDPOINTS)
                  .filter(([k, cfg]) => k.endsWith('_mainnet') && !cfg.fireblocksRescanSupported)
                  .map(([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.label}{cfg.fireblocksId ? ` — ${cfg.fireblocksId}` : ''}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Testnet">
                {Object.entries(CHAIN_ENDPOINTS)
                  .filter(([k]) => k.endsWith('_testnet'))
                  .map(([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.label}{cfg.fireblocksId ? ` — ${cfg.fireblocksId}` : ''}
                    </option>
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
                    {result.chainMismatch && (
                      <div className="cosmos-chain-warning">
                        <div className="cosmos-chain-warning-header">
                          <span className="cosmos-chain-warning-icon">⚠</span>
                          <strong>Wrong chain selected?</strong>
                        </div>
                        <div className="cosmos-chain-warning-body">
                          The transaction looks like a <strong>{result.chainMismatch.detectedLabel}</strong> TX
                          (detected from {result.chainMismatch.reason}), but you selected <strong>{result.chain}</strong>.
                          The verdict below may be meaningless — the TX can never land on the selected chain.
                        </div>
                        <button
                          type="button"
                          className="cosmos-chain-switch-btn"
                          onClick={() => setChain(result.chainMismatch.detectedChain)}
                        >
                          Switch to {result.chainMismatch.detectedLabel} and re-check
                        </button>
                      </div>
                    )}
                    <div className="cosmos-result-grid">
                      <div className="cosmos-stat">
                        <span className="field-label">Chain</span>
                        <span className="field-value">
                          {result.chain}
                          {result.fireblocksId && (
                            <span className="cosmos-fb-id-badge" title="Fireblocks asset ID">
                              {result.fireblocksId}
                            </span>
                          )}
                        </span>
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
