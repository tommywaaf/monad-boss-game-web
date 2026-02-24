import { useState, useRef, useCallback, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { trackUsage } from '../utils/counter'
import './Broadcaster.css'

const NETWORKS = [
  // EVM Networks
  { id: 'auto-evm', name: '🔄 Auto (Detect Chain)', rpc: '', type: 'evm', isAuto: true },
  { id: 'ethereum', name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com', type: 'evm', chainId: 1, explorer: 'https://etherscan.io/tx/' },
  { id: 'eth-test5', name: 'ETH_TEST5 (Sepolia)', rpc: 'https://ethereum-sepolia-rpc.publicnode.com', type: 'evm', chainId: 11155111, explorer: 'https://sepolia.etherscan.io/tx/' },
  { id: 'arbitrum', name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc', type: 'evm', chainId: 42161, explorer: 'https://arbiscan.io/tx/' },
  { id: 'astar', name: 'Astar', rpc: 'https://evm.astar.network', type: 'evm', chainId: 592, explorer: 'https://astar.blockscout.com/tx/' },
  { id: 'aurora', name: 'Aurora', rpc: 'https://mainnet.aurora.dev', type: 'evm', chainId: 1313161554, explorer: 'https://explorer.aurora.dev/tx/' },
  { id: 'avalanche', name: 'Avalanche C-Chain', rpc: 'https://api.avax.network/ext/bc/C/rpc', type: 'evm', chainId: 43114, explorer: 'https://snowtrace.io/tx/' },
  { id: 'base', name: 'Base', rpc: 'https://mainnet.base.org', type: 'evm', chainId: 8453, explorer: 'https://basescan.org/tx/' },
  { id: 'blast', name: 'Blast Mainnet', rpc: 'https://zkevmrpc.blastchain.org', type: 'evm', chainId: 238, explorer: 'https://blastchain.org/tx/' },
  { id: 'bsc', name: 'BNB Smart Chain', rpc: 'https://bsc-dataseed.binance.org', type: 'evm', chainId: 56, explorer: 'https://bscscan.com/tx/' },
  { id: 'canto', name: 'Canto', rpc: 'https://canto.gravitychain.io', type: 'evm', chainId: 7700, explorer: 'https://tuber.build/tx/' },
  { id: 'celo', name: 'Celo', rpc: 'https://forno.celo.org', type: 'evm', chainId: 42220, explorer: 'https://celoscan.io/tx/' },
  { id: 'chiliz', name: 'Chiliz', rpc: 'https://rpc.ankr.com/chiliz', type: 'evm', chainId: 88888, explorer: 'https://chiliscan.com/tx/' },
  { id: 'ethw', name: 'Ethereum PoW', rpc: 'https://mainnet.ethereumpow.org', type: 'evm', chainId: 10001, explorer: 'https://www.oklink.com/ethw/tx/' },
  { id: 'evmos', name: 'Evmos', rpc: 'https://evmos-evm.publicnode.com', type: 'evm', chainId: 9001, explorer: 'https://escan.live/tx/' },
  { id: 'fantom', name: 'Fantom', rpc: 'https://rpcapi.fantom.network', type: 'evm', chainId: 250, explorer: 'https://ftmscan.com/tx/' },
  { id: 'gnosis', name: 'Gnosis Chain (xDAI)', rpc: 'https://rpc.gnosischain.com', type: 'evm', chainId: 100, explorer: 'https://gnosisscan.io/tx/' },
  { id: 'kava', name: 'KAVA EVM', rpc: 'https://evm.kava.io', type: 'evm', chainId: 2222, explorer: 'https://kavascan.com/tx/' },
  { id: 'plasma', name: 'Plasma Mainnet', rpc: 'https://rpc.plasma.to', type: 'evm', chainId: 9745, explorer: 'https://plasmascan.to/tx/' },
  { id: 'linea', name: 'Linea', rpc: 'https://rpc.linea.build', type: 'evm', chainId: 59144, explorer: 'https://lineascan.build/tx/' },
  { id: 'manta', name: 'Manta Pacific', rpc: 'https://manta.nirvanalabs.xyz/mantapublic', type: 'evm', chainId: 169, explorer: 'https://manta.socialscan.io/tx/' },
  { id: 'monad', name: 'Monad', rpc: 'https://rpc3.monad.xyz', type: 'evm', chainId: 143, explorer: 'https://monadvision.com/tx/' },
  { id: 'megaeth', name: 'MegaETH', rpc: 'https://carrot.megaeth.com/rpc', type: 'evm', chainId: 6342, explorer: 'https://mega.etherscan.io/tx/' },
  { id: 'moonbeam', name: 'Moonbeam', rpc: 'https://rpc.api.moonbeam.network', type: 'evm', chainId: 1284, explorer: 'https://moonscan.io/tx/' },
  { id: 'moonriver', name: 'Moonriver', rpc: 'https://rpc.api.moonriver.moonbeam.network', type: 'evm', chainId: 1285, explorer: 'https://moonriver.moonscan.io/tx/' },
  { id: 'oasys', name: 'Oasys', rpc: 'https://rpc.mainnet.oasys.games', type: 'evm', chainId: 248, explorer: 'https://scan.oasys.games/tx/' },
  { id: 'optimism', name: 'Optimism', rpc: 'https://mainnet.optimism.io', type: 'evm', chainId: 10, explorer: 'https://optimistic.etherscan.io/tx/' },
  { id: 'polygon', name: 'Polygon', rpc: 'https://polygon-rpc.com', type: 'evm', chainId: 137, explorer: 'https://polygonscan.com/tx/' },
  { id: 'ronin', name: 'Ronin', rpc: 'https://api.roninchain.com/rpc', type: 'evm', chainId: 2020, explorer: 'https://app.roninchain.com/tx/' },
  { id: 'rsk', name: 'RSK', rpc: 'https://public-node.rsk.co', type: 'evm', chainId: 30, explorer: 'https://explorer.rsk.co/tx/' },
  { id: 'shimmer', name: 'Shimmer EVM', rpc: 'https://json-rpc.evm.shimmer.network', type: 'evm', chainId: 148, explorer: 'https://explorer.evm.shimmer.network/tx/' },
  { id: 'smartbch', name: 'SmartBCH', rpc: 'https://smartbch.greyh.at', type: 'evm', chainId: 10000, explorer: 'https://www.smartscan.cash/tx/' },
  { id: 'songbird', name: 'Songbird', rpc: 'https://songbird-api.flare.network/ext/C/rpc', type: 'evm', chainId: 19, explorer: 'https://songbird-explorer.flare.network/tx/' },
  { id: 'velas', name: 'Velas', rpc: 'https://evmexplorer.velas.com/rpc', type: 'evm', chainId: 106, explorer: 'https://evmexplorer.velas.com/tx/' },
  { id: 'worldchain', name: 'Worldchain', rpc: 'https://worldchain-mainnet.g.alchemy.com/public', type: 'evm', chainId: 480, explorer: 'https://worldscan.org/tx/' },
  { id: 'xdc', name: 'XDC Network', rpc: 'https://rpc.xinfin.network', type: 'evm', chainId: 50, explorer: 'https://xdcscan.io/tx/' },
  { id: 'zkevm', name: 'Polygon zkEVM', rpc: 'https://zkevm-rpc.com', type: 'evm', chainId: 1101, explorer: 'https://zkevm.polygonscan.com/tx/' },
  { id: 'custom-evm', name: 'Custom EVM RPC...', rpc: '', type: 'evm' },
  // Solana Networks
  { id: 'solana', name: 'Solana Mainnet (QuickNode)', rpc: 'https://delicate-misty-flower.solana-mainnet.quiknode.pro/9428bcea652ef50dc68b571c3cda0f9221534b40/', type: 'solana', explorer: 'https://solscan.io/tx/' },
  { id: 'custom-solana', name: 'Custom Solana RPC...', rpc: '', type: 'solana' },
  // XRP Ledger
  { id: 'xrp', name: 'XRP Mainnet', rpc: 'https://xrplcluster.com/', type: 'xrp', explorer: 'https://xrpscan.com/tx/' },
  // Stellar (XLM)
  { id: 'stellar', name: 'Stellar Mainnet', rpc: 'https://horizon.stellar.org', type: 'stellar', explorer: 'https://stellar.expert/explorer/public/tx/' },
  // Bitcoin-style chains
  { id: 'bitcoin', name: 'Bitcoin (BTC)', rpc: 'https://mempool.space/api', type: 'bitcoin', explorer: 'https://mempool.space/tx/' },
  { id: 'litecoin', name: 'Litecoin (LTC)', rpc: 'https://api.blockcypher.com/v1/ltc/main', type: 'bitcoin', explorer: 'https://blockchair.com/litecoin/transaction/' },
  { id: 'bitcoincash', name: 'Bitcoin Cash (BCH)', rpc: 'https://rest.bitcoin.com/v2/rawtransactions', type: 'bitcoincash', explorer: 'https://blockchair.com/bitcoin-cash/transaction/' },
]

// Chain ID to network mapping for auto-detection
const CHAIN_ID_MAP = {
  1: { name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com', explorer: 'https://etherscan.io/tx/' },
  11155111: { name: 'ETH_TEST5 (Sepolia)', rpc: 'https://ethereum-sepolia-rpc.publicnode.com', explorer: 'https://sepolia.etherscan.io/tx/' },
  10: { name: 'Optimism', rpc: 'https://mainnet.optimism.io', explorer: 'https://optimistic.etherscan.io/tx/' },
  19: { name: 'Songbird', rpc: 'https://songbird-api.flare.network/ext/C/rpc', explorer: 'https://songbird-explorer.flare.network/tx/' },
  30: { name: 'RSK', rpc: 'https://public-node.rsk.co', explorer: 'https://explorer.rsk.co/tx/' },
  50: { name: 'XDC Network', rpc: 'https://rpc.xinfin.network', explorer: 'https://xdcscan.io/tx/' },
  56: { name: 'BNB Smart Chain', rpc: 'https://bsc-dataseed.binance.org', explorer: 'https://bscscan.com/tx/' },
  100: { name: 'Gnosis Chain', rpc: 'https://rpc.gnosischain.com', explorer: 'https://gnosisscan.io/tx/' },
  106: { name: 'Velas', rpc: 'https://evmexplorer.velas.com/rpc', explorer: 'https://evmexplorer.velas.com/tx/' },
  137: { name: 'Polygon', rpc: 'https://polygon-rpc.com', explorer: 'https://polygonscan.com/tx/' },
  143: { name: 'Monad', rpc: 'https://rpc3.monad.xyz', explorer: 'https://monadvision.com/tx/' },
  169: { name: 'Manta Pacific', rpc: 'https://manta.nirvanalabs.xyz/mantapublic', explorer: 'https://manta.socialscan.io/tx/' },
  6342: { name: 'MegaETH', rpc: 'https://carrot.megaeth.com/rpc', explorer: 'https://mega.etherscan.io/tx/' },
  148: { name: 'Shimmer EVM', rpc: 'https://json-rpc.evm.shimmer.network', explorer: 'https://explorer.evm.shimmer.network/tx/' },
  248: { name: 'Oasys', rpc: 'https://rpc.mainnet.oasys.games', explorer: 'https://scan.oasys.games/tx/' },
  250: { name: 'Fantom', rpc: 'https://rpcapi.fantom.network', explorer: 'https://ftmscan.com/tx/' },
  238: { name: 'Blast Mainnet', rpc: 'https://zkevmrpc.blastchain.org', explorer: 'https://blastchain.org/tx/' },
  480: { name: 'Worldchain', rpc: 'https://worldchain-mainnet.g.alchemy.com/public', explorer: 'https://worldscan.org/tx/' },
  592: { name: 'Astar', rpc: 'https://evm.astar.network', explorer: 'https://astar.blockscout.com/tx/' },
  1101: { name: 'Polygon zkEVM', rpc: 'https://zkevm-rpc.com', explorer: 'https://zkevm.polygonscan.com/tx/' },
  1284: { name: 'Moonbeam', rpc: 'https://rpc.api.moonbeam.network', explorer: 'https://moonscan.io/tx/' },
  1285: { name: 'Moonriver', rpc: 'https://rpc.api.moonriver.moonbeam.network', explorer: 'https://moonriver.moonscan.io/tx/' },
  2020: { name: 'Ronin', rpc: 'https://api.roninchain.com/rpc', explorer: 'https://app.roninchain.com/tx/' },
  2222: { name: 'KAVA EVM', rpc: 'https://evm.kava.io', explorer: 'https://kavascan.com/tx/' },
  7700: { name: 'Canto', rpc: 'https://canto.gravitychain.io', explorer: 'https://tuber.build/tx/' },
  8453: { name: 'Base', rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org/tx/' },
  9001: { name: 'Evmos', rpc: 'https://evmos-evm.publicnode.com', explorer: 'https://escan.live/tx/' },
  9745: { name: 'Plasma Mainnet', rpc: 'https://rpc.plasma.to', explorer: 'https://plasmascan.to/tx/' },
  10000: { name: 'SmartBCH', rpc: 'https://smartbch.greyh.at', explorer: 'https://www.smartscan.cash/tx/' },
  10001: { name: 'Ethereum PoW', rpc: 'https://mainnet.ethereumpow.org', explorer: 'https://www.oklink.com/ethw/tx/' },
  42161: { name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc', explorer: 'https://arbiscan.io/tx/' },
  42220: { name: 'Celo', rpc: 'https://forno.celo.org', explorer: 'https://celoscan.io/tx/' },
  43114: { name: 'Avalanche C-Chain', rpc: 'https://api.avax.network/ext/bc/C/rpc', explorer: 'https://snowtrace.io/tx/' },
  59144: { name: 'Linea', rpc: 'https://rpc.linea.build', explorer: 'https://lineascan.build/tx/' },
  88888: { name: 'Chiliz', rpc: 'https://rpc.ankr.com/chiliz', explorer: 'https://chiliscan.com/tx/' },
  1313161554: { name: 'Aurora', rpc: 'https://mainnet.aurora.dev', explorer: 'https://explorer.aurora.dev/tx/' },
}

// Decode RLP to extract chain ID from EVM transaction for AUTO MODE
const decodeRlpChainId = (rlpHex) => {
  try {
    const hex = rlpHex.startsWith('0x') ? rlpHex.slice(2) : rlpHex
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
    
    // Check transaction type (EIP-2718)
    const txType = bytes[0]
    
    if (txType === 0x01) {
      // EIP-2930 (Type 1) - chain ID is first item after type byte
      return decodeRlpItem(bytes, 1).chainId
    } else if (txType === 0x02) {
      // EIP-1559 (Type 2) - chain ID is first item after type byte
      return decodeRlpItem(bytes, 1).chainId
    } else if (txType === 0x03) {
      // EIP-4844 (Type 3) - chain ID is first item after type byte
      return decodeRlpItem(bytes, 1).chainId
    } else if (txType >= 0xc0) {
      // Legacy transaction (starts with RLP list prefix)
      // Chain ID derived from v value: chainId = (v - 35) / 2 for EIP-155
      // Or v = 27/28 for pre-EIP-155 (mainnet assumed)
      return decodeLegacyChainId(bytes)
    }
    
    return null
  } catch (e) {
    console.error('Failed to decode RLP:', e)
    return null
  }
}

// Decode RLP item to get chain ID (for typed transactions)
const decodeRlpItem = (bytes, offset) => {
  // Skip the type byte, then decode the RLP list
  const listByte = bytes[offset]
  let listStart = offset + 1
  let listLength = 0
  
  if (listByte <= 0xf7) {
    // Short list (0-55 bytes)
    listLength = listByte - 0xc0
  } else {
    // Long list
    const lengthOfLength = listByte - 0xf7
    listLength = 0
    for (let i = 0; i < lengthOfLength; i++) {
      listLength = (listLength << 8) + bytes[listStart + i]
    }
    listStart += lengthOfLength
  }
  
  // First item in the list is the chain ID
  const chainIdByte = bytes[listStart]
  let chainId = 0
  
  if (chainIdByte <= 0x7f) {
    // Single byte value
    chainId = chainIdByte
  } else if (chainIdByte <= 0xb7) {
    // String 0-55 bytes
    const strLength = chainIdByte - 0x80
    for (let i = 0; i < strLength; i++) {
      chainId = (chainId << 8) + bytes[listStart + 1 + i]
    }
  }
  
  return { chainId }
}

// Decode legacy transaction to get chain ID from v value
const decodeLegacyChainId = (bytes) => {
  // Parse the RLP list to find the v value (7th item: nonce, gasPrice, gasLimit, to, value, data, v, r, s)
  let offset = 0
  const listByte = bytes[offset]
  
  if (listByte <= 0xf7) {
    offset = 1
  } else {
    const lengthOfLength = listByte - 0xf7
    offset = 1 + lengthOfLength
  }
  
  // Skip first 6 items (nonce, gasPrice, gasLimit, to, value, data)
  for (let i = 0; i < 6; i++) {
    offset = skipRlpItem(bytes, offset)
  }
  
  // Now read v value
  const vByte = bytes[offset]
  let v = 0
  
  if (vByte <= 0x7f) {
    v = vByte
  } else if (vByte <= 0xb7) {
    const strLength = vByte - 0x80
    for (let i = 0; i < strLength; i++) {
      v = (v << 8) + bytes[offset + 1 + i]
    }
  }
  
  // EIP-155: v = chainId * 2 + 35 or chainId * 2 + 36
  // So chainId = (v - 35) / 2
  if (v === 27 || v === 28) {
    // Pre-EIP-155, assume mainnet
    return 1
  } else if (v >= 35) {
    return Math.floor((v - 35) / 2)
  }
  
  return null
}

// Skip an RLP item and return the new offset
const skipRlpItem = (bytes, offset) => {
  const byte = bytes[offset]
  
  if (byte <= 0x7f) {
    // Single byte
    return offset + 1
  } else if (byte <= 0xb7) {
    // String 0-55 bytes
    return offset + 1 + (byte - 0x80)
  } else if (byte <= 0xbf) {
    // String > 55 bytes
    const lengthOfLength = byte - 0xb7
    let strLength = 0
    for (let i = 0; i < lengthOfLength; i++) {
      strLength = (strLength << 8) + bytes[offset + 1 + i]
    }
    return offset + 1 + lengthOfLength + strLength
  } else if (byte <= 0xf7) {
    // List 0-55 bytes
    return offset + 1 + (byte - 0xc0)
  } else {
    // List > 55 bytes
    const lengthOfLength = byte - 0xf7
    let listLength = 0
    for (let i = 0; i < lengthOfLength; i++) {
      listLength = (listLength << 8) + bytes[offset + 1 + i]
    }
    return offset + 1 + lengthOfLength + listLength
  }
}

// Base58 alphabet for Solana
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

// Convert bytes to base58
const bytesToBase58 = (bytes) => {
  const digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8
      digits[i] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  // Handle leading zeros
  let result = ''
  for (const byte of bytes) {
    if (byte === 0) result += BASE58_ALPHABET[0]
    else break
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]]
  }
  return result
}

// Detect encoding type for Solana transactions
const detectSolanaEncoding = (input) => {
  const trimmed = input.trim().replace(/^["']|["']$/g, '')
  
  // Check for base64 indicators (+, /, =)
  if (/[+/=]/.test(trimmed)) {
    try {
      atob(trimmed)
      return { payload: trimmed, encoding: 'base64' }
    } catch (e) {
      // Not valid base64
    }
  }
  
  // Check if it's hex
  const hexMatch = trimmed.match(/^(?:0x)?([0-9a-fA-F]+)$/)
  if (hexMatch) {
    const hex = hexMatch[1]
    if (hex.length % 2 === 0) {
      // Convert hex to bytes then to base58
      const bytes = new Uint8Array(hex.length / 2)
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
      }
      return { payload: bytesToBase58(bytes), encoding: 'base58' }
    }
  }
  
  // Check if it's valid base58 (no 0, O, I, l characters)
  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
    return { payload: trimmed, encoding: 'base58' }
  }
  
  // Default: try as base64
  try {
    atob(trimmed)
    return { payload: trimmed, encoding: 'base64' }
  } catch (e) {
    // Fall back to base58
    return { payload: trimmed, encoding: 'base58' }
  }
}

function Broadcaster() {
  const [selectedNetwork, setSelectedNetwork] = useState(NETWORKS[0])
  const [customRpc, setCustomRpc] = useState('')
  const [inputText, setInputText] = useState('')
  const [transactions, setTransactions] = useState([])
  const [results, setResults] = useState([])
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  const [broadcastProgress, setBroadcastProgress] = useState({ current: 0, total: 0 })
  const fileInputRef = useRef(null)
  
  // Set page title
  useEffect(() => {
    document.title = 'Rebroadcaster Tool'
    return () => { document.title = 'Monad Boss Game' }
  }, [])
  
  // Rate limiting - simple tx per minute
  const [txPerMinute, setTxPerMinute] = useState(50)
  const abortControllerRef = useRef(null)
  const [showSettings, setShowSettings] = useState(false)
  
  // Retry settings
  const [maxRetries, setMaxRetries] = useState(3)
  const [retryDelay, setRetryDelay] = useState(1000) // Base delay for exponential backoff
  
  // Solana-specific settings
  const [solanaSkipPreflight, setSolanaSkipPreflight] = useState(false)
  
  // Pagination and search for results
  const [resultsPage, setResultsPage] = useState(1)
  const [resultsPerPage, setResultsPerPage] = useState(100)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'success', 'failed'
  
  // Copy to clipboard with visual feedback
  const [copiedId, setCopiedId] = useState(null)
  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1000)
  }
  
  const isSolana = selectedNetwork.type === 'solana'
  const isXrp = selectedNetwork.type === 'xrp'
  const isStellar = selectedNetwork.type === 'stellar'
  const isBitcoin = selectedNetwork.type === 'bitcoin' || selectedNetwork.type === 'bitcoincash'
  const isAutoMode = selectedNetwork.id === 'auto-evm'
  
  // Filter and paginate results
  const filteredResults = results.filter(r => {
    // Status filter
    if (statusFilter === 'success' && !r.success) return false
    if (statusFilter === 'failed' && r.success) return false
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesTxHash = r.txHash?.toLowerCase().includes(query)
      const matchesError = r.error?.toLowerCase().includes(query)
      const matchesChain = r.chainName?.toLowerCase().includes(query)
      const matchesIndex = r.index.toString().includes(query)
      const matchesRlp = r.rlp?.toLowerCase().includes(query)
      return matchesTxHash || matchesError || matchesChain || matchesIndex || matchesRlp
    }
    
    return true
  })
  
  const totalPages = Math.ceil(filteredResults.length / resultsPerPage)
  const paginatedResults = filteredResults.slice(
    (resultsPage - 1) * resultsPerPage,
    resultsPage * resultsPerPage
  )
  
  // Reset to page 1 when filters change
  const handleSearchChange = (query) => {
    setSearchQuery(query)
    setResultsPage(1)
  }
  
  const handleStatusFilterChange = (filter) => {
    setStatusFilter(filter)
    setResultsPage(1)
  }
  
  // Get chain info for a transaction (for auto mode)
  const getChainInfo = (txPayload) => {
    // Always decode chain ID from transaction for consistent formatting
    const chainId = decodeRlpChainId(txPayload)
    
    // If we have a chain ID in the map, use that format for display
    if (chainId && CHAIN_ID_MAP[chainId]) {
      // Use CHAIN_ID_MAP format for name and explorer (consistent formatting)
      // But preserve manually selected RPC (keep logic unchanged)
      return {
        chainId,
        chainName: CHAIN_ID_MAP[chainId].name,
        rpc: isAutoMode ? CHAIN_ID_MAP[chainId].rpc : getRpcUrl(), // Use selected RPC when not auto mode
        explorer: CHAIN_ID_MAP[chainId].explorer
      }
    }
    
    // If not in auto mode and chain ID not in map, fall back to selected network
    if (!isAutoMode) {
      return { 
        chainId: selectedNetwork.chainId || chainId || null, 
        chainName: selectedNetwork.name, 
        rpc: getRpcUrl(),
        explorer: selectedNetwork.explorer || null
      }
    }
    
    // Auto mode but chain ID not in map
    return {
      chainId,
      chainName: chainId ? `Unknown (${chainId})` : 'Unknown',
      rpc: null,
      explorer: null
    }
  }

  const normalizeTransaction = (tx, networkType) => {
    const trimmed = tx.trim().replace(/^["']|["']$/g, '')
    if (!trimmed) return null
    
    if (networkType === 'solana') {
      // For Solana, return the raw string - encoding will be detected at broadcast time
      return trimmed
    }
    
    if (networkType === 'xrp') {
      // For XRP, strip 0x prefix if present (XRP expects raw hex)
      return trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed
    }
    
    if (networkType === 'stellar') {
      // For Stellar, return the base64 encoded transaction as-is
      return trimmed
    }
    
    if (networkType === 'bitcoin' || networkType === 'bitcoincash') {
      // For Bitcoin-style chains, return raw hex (strip 0x if present)
      return trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed
    }
    
    // For EVM, ensure 0x prefix
    return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
  }

  const parseTransactions = useCallback((text, networkType) => {
    const lines = text.split('\n')
    const txs = lines
      .map(line => normalizeTransaction(line, networkType))
      .filter(tx => tx !== null && tx.length > 2)
    return txs
  }, [])

  const handleInputChange = (e) => {
    const text = e.target.value
    setInputText(text)
    setTransactions(parseTransactions(text, selectedNetwork.type))
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    setInputText(text)
    setTransactions(parseTransactions(text, selectedNetwork.type))
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setInputText(text)
      setTransactions(parseTransactions(text, selectedNetwork.type))
    } catch (err) {
      console.error('Failed to read clipboard:', err)
      alert('Failed to read from clipboard. Please ensure you have granted clipboard permissions.')
    }
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    
    const file = e.dataTransfer.files?.[0]
    if (file) {
      file.text().then(text => {
        setInputText(text)
        setTransactions(parseTransactions(text, selectedNetwork.type))
      })
    }
  }, [parseTransactions, selectedNetwork.type])
  
  // Re-parse transactions when network type changes
  const handleNetworkChange = (network) => {
    setSelectedNetwork(network)
    if (inputText) {
      setTransactions(parseTransactions(inputText, network.type))
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const clearAll = () => {
    setInputText('')
    setTransactions([])
    setResults([])
  }

  const getRpcUrl = () => {
    if (selectedNetwork.id === 'custom-evm' || selectedNetwork.id === 'custom-solana') {
      return customRpc
    }
    return selectedNetwork.rpc
  }

  const getDelay = () => {
    // Calculate delay in ms from tx per minute
    // txPerMinute = 50 means 1 tx every 1200ms (60000ms / 50)
    if (txPerMinute <= 0) return 0
    return Math.ceil(60000 / txPerMinute)
  }

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  const formatTime = (seconds) => {
    if (seconds < 60) return `${Math.ceil(seconds)}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${mins}m`
  }

  // Patterns that indicate a retryable error
  const RETRYABLE_PATTERNS = [
    /rate limit/i,
    /too many requests/i,
    /timeout/i,
    /timed out/i,
    /ETIMEDOUT/i,
    /ECONNRESET/i,
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /network/i,
    /socket hang up/i,
    /502/i,
    /503/i,
    /504/i,
    /server error/i,
    /internal error/i,
    /temporarily unavailable/i,
    /try again/i,
    /overloaded/i,
    /capacity/i,
  ]

  // Patterns that indicate a permanent failure (do NOT retry)
  const PERMANENT_FAILURE_PATTERNS = [
    // EVM errors
    /nonce too low/i,
    /nonce too high/i,
    /insufficient funds/i,
    /insufficient balance/i,
    /gas too low/i,
    /intrinsic gas too low/i,
    /exceeds block gas limit/i,
    /already known/i,
    /already imported/i,
    /replacement transaction underpriced/i,
    /transaction underpriced/i,
    /invalid sender/i,
    /invalid signature/i,
    /invalid transaction/i,
    /invalid nonce/i,
    /invalid chain id/i,
    /wrong chain/i,
    /tx type not supported/i,
    /max fee per gas less than block base fee/i,
    // Solana errors
    /Blockhash not found/i,
    /Transaction signature verification failure/i,
    /This transaction has already been processed/i,
    /Transaction already processed/i,
    /AlreadyProcessed/i,
    /Instruction .* failed/i,
    /custom program error/i,
    /Program failed/i,
    /insufficient lamports/i,
    /account not found/i,
    /invalid account data/i,
    /invalid program id/i,
    /AccountNotFound/i,
    /InstructionError/i,
    /max priority fee per gas higher than max fee per gas/i,
    /sender doesn't have enough funds/i,
    /execution reverted/i,
    /contract creation code storage out of gas/i,
    /max initcode size exceeded/i,
    // XRP errors
    /tefPAST_SEQ/i,
    /tefMAX_LEDGER/i,
    /tecUNFUNDED/i,
    /tecNO_DST/i,
    /tecNO_DST_INSUF_XRP/i,
    /tecPATH_DRY/i,
    /tecINSUF_FEE/i,
    /temBAD_SEQUENCE/i,
    /temBAD_FEE/i,
    /temBAD_SIGNATURE/i,
    /temINVALID/i,
    /tefALREADY/i,
  ]

  const isRetryableError = (error, httpStatus) => {
    // HTTP 429 is always retryable
    if (httpStatus === 429) return true
    // HTTP 5xx are retryable
    if (httpStatus >= 500 && httpStatus < 600) return true
    
    if (!error) return false
    const errorStr = typeof error === 'string' ? error : JSON.stringify(error)
    
    // Check if it's a permanent failure first (takes priority)
    for (const pattern of PERMANENT_FAILURE_PATTERNS) {
      if (pattern.test(errorStr)) return false
    }
    
    // Check if it matches retryable patterns
    for (const pattern of RETRYABLE_PATTERNS) {
      if (pattern.test(errorStr)) return true
    }
    
    return false
  }

  const broadcastTransaction = async (txPayload, signal, overrideRpc = null) => {
    const rpcUrl = overrideRpc || getRpcUrl()
    
    if (!rpcUrl) {
      return {
        success: false,
        error: 'No RPC URL available for this chain',
        txHash: null,
        retryable: false,
        httpStatus: null
      }
    }
    
    try {
      let response
      
      if (isStellar) {
        // Stellar uses form-encoded POST to /transactions endpoint
        const formBody = new URLSearchParams()
        formBody.append('tx', txPayload)
        
        response = await fetch(`${rpcUrl}/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formBody.toString(),
          signal
        })
        
        const httpStatus = response.status
        const data = await response.json()
        
        if (response.ok && data.hash) {
          return {
            success: true,
            error: null,
            txHash: data.hash,
            retryable: false,
            httpStatus
          }
        } else {
          // Stellar error response
          const errorMsg = data.extras?.result_codes?.transaction || 
                          data.title || 
                          data.detail || 
                          'Transaction failed'
          return {
            success: false,
            error: errorMsg,
            txHash: null,
            retryable: isRetryableError(errorMsg, httpStatus),
            httpStatus
          }
        }
      }
      
      if (isBitcoin) {
        // Bitcoin-style chains use different APIs
        // Mempool.space: POST raw hex to /tx
        // BlockCypher: POST JSON to /txs/push
        // Bitcoin.com: POST JSON to /sendRawTransaction
        let endpoint
        let requestBody
        let headers = {}
        
        if (rpcUrl.includes('mempool.space')) {
          endpoint = `${rpcUrl}/tx`
          requestBody = txPayload
          headers = { 'Content-Type': 'text/plain' }
        } else if (rpcUrl.includes('blockcypher')) {
          endpoint = `${rpcUrl}/txs/push`
          requestBody = JSON.stringify({ tx: txPayload })
          headers = { 'Content-Type': 'application/json' }
        } else if (rpcUrl.includes('bitcoin.com')) {
          endpoint = `${rpcUrl}/sendRawTransaction`
          requestBody = JSON.stringify({ hexes: [txPayload] })
          headers = { 'Content-Type': 'application/json' }
        } else {
          // Default to mempool.space format
          endpoint = `${rpcUrl}/tx`
          requestBody = txPayload
          headers = { 'Content-Type': 'text/plain' }
        }
        
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: requestBody,
          signal
        })
        
        const httpStatus = response.status
        
        if (response.ok) {
          const responseText = await response.text()
          // Mempool.space returns just the txid as plain text
          // BlockCypher returns JSON with tx.hash
          // Bitcoin.com returns JSON array [txid]
          let txHash
          try {
            const jsonData = JSON.parse(responseText)
            if (Array.isArray(jsonData) && jsonData.length > 0) {
              // Bitcoin.com format
              txHash = jsonData[0]
            } else {
              // BlockCypher or other JSON format
              txHash = jsonData.tx?.hash || jsonData.txid || responseText.trim()
            }
          } catch {
            // Plain text response (mempool.space)
            txHash = responseText.trim()
          }
          
          return {
            success: true,
            error: null,
            txHash,
            retryable: false,
            httpStatus
          }
        } else {
          const errorText = await response.text()
          return {
            success: false,
            error: errorText || `HTTP ${httpStatus}`,
            txHash: null,
            retryable: isRetryableError(errorText, httpStatus),
            httpStatus
          }
        }
      }
      
      let body
      
      if (isSolana) {
        // Detect encoding for Solana transactions
        const { payload, encoding } = detectSolanaEncoding(txPayload)
        body = {
          jsonrpc: '2.0',
          id: 1,
          method: 'sendTransaction',
          params: [
            payload,
            {
              encoding: encoding,
              skipPreflight: solanaSkipPreflight,
              maxRetries: maxRetries,
            }
          ]
        }
      } else if (isXrp) {
        // XRP Ledger transaction
        body = {
          method: 'submit',
          params: [
            {
              tx_blob: txPayload
            }
          ]
        }
      } else {
        // EVM transaction
        body = {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_sendRawTransaction',
          params: [txPayload]
        }
      }
      
      response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal
      })

      const httpStatus = response.status
      const data = await response.json()
      
      // Handle XRP response format
      if (isXrp) {
        const result = data.result
        if (!result) {
          return {
            success: false,
            error: 'No result in response',
            txHash: null,
            retryable: true,
            httpStatus
          }
        }
        
        // XRP success codes start with "tes" (e.g., tesSUCCESS)
        const engineResult = result.engine_result || ''
        const isSuccess = engineResult.startsWith('tes')
        const txHash = result.tx_json?.hash || result.hash || null
        
        if (isSuccess) {
          return {
            success: true,
            error: null,
            txHash,
            retryable: false,
            httpStatus
          }
        } else {
          const errorMsg = `${engineResult}: ${result.engine_result_message || 'Unknown error'}`
          return {
            success: false,
            error: errorMsg,
            txHash,
            retryable: isRetryableError(errorMsg, httpStatus),
            httpStatus
          }
        }
      }
      
      if (data.error) {
        const errorMsg = data.error.message || JSON.stringify(data.error)
        return {
          success: false,
          error: errorMsg,
          txHash: null,
          retryable: isRetryableError(errorMsg, httpStatus),
          httpStatus
        }
      }

      return {
        success: true,
        error: null,
        txHash: data.result,
        retryable: false,
        httpStatus
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          success: false,
          error: 'Aborted',
          txHash: null,
          retryable: false,
          httpStatus: null
        }
      }
      return {
        success: false,
        error: err.message,
        txHash: null,
        retryable: isRetryableError(err.message, null),
        httpStatus: null
      }
    }
  }

  const broadcastWithRetry = async (rlpHex, signal, onRetry, overrideRpc = null) => {
    let lastResult = null
    let attempts = 0
    
    while (attempts <= maxRetries) {
      if (signal.aborted) {
        return { ...lastResult, attempts, aborted: true }
      }
      
      lastResult = await broadcastTransaction(rlpHex, signal, overrideRpc)
      attempts++
      
      // Success or non-retryable error - we're done
      if (lastResult.success || !lastResult.retryable) {
        return { ...lastResult, attempts }
      }
      
      // Max retries reached
      if (attempts > maxRetries) {
        return { ...lastResult, attempts, exhaustedRetries: true }
      }
      
      // Calculate exponential backoff delay
      const backoffDelay = retryDelay * Math.pow(2, attempts - 1)
      const jitter = Math.random() * 500 // Add some jitter
      const waitTime = Math.min(backoffDelay + jitter, 30000) // Cap at 30s
      
      if (onRetry) {
        onRetry(attempts, waitTime)
      }
      
      await sleep(waitTime)
    }
    
    return { ...lastResult, attempts }
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  const handleBroadcast = async () => {
    if (transactions.length === 0) {
      alert('No transactions to broadcast')
      return
    }

    // For non-auto mode, validate RPC URL
    if (!isAutoMode) {
      const rpcUrl = getRpcUrl()
      if (!rpcUrl) {
        alert('Please enter a valid RPC URL')
        return
      }
    }

    // Create abort controller
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    trackUsage('bcaster', transactions.length)

    setIsBroadcasting(true)
    setBroadcastProgress({ current: 0, total: transactions.length })
    setResults([])

    const newResults = []
    const delay = getDelay()

    // Process transactions one at a time with rate limiting
    for (let i = 0; i < transactions.length; i++) {
      if (signal.aborted) break

      const tx = transactions[i]
      const txStartTime = Date.now()

      // Get chain info (for auto mode, this decodes the tx)
      const chainInfo = getChainInfo(tx)

      // Broadcast with retry support, using chain-specific RPC for auto mode
      const result = await broadcastWithRetry(tx, signal, null, chainInfo.rpc)
      
      newResults.push({
        index: i + 1,
        rlp: tx,
        success: result.success,
        txHash: result.txHash,
        error: result.error,
        timestamp: new Date().toISOString(),
        attempts: result.attempts || 1,
        retryable: result.retryable,
        exhaustedRetries: result.exhaustedRetries,
        chainId: chainInfo.chainId,
        chainName: chainInfo.chainName,
        rpcUsed: chainInfo.rpc,
        explorer: chainInfo.explorer
      })
      
      setBroadcastProgress({ current: i + 1, total: transactions.length })
      setResults([...newResults])

      // Rate limiting delay (only if not last tx and delay > 0)
      if (delay > 0 && i < transactions.length - 1 && !signal.aborted) {
        const elapsed = Date.now() - txStartTime
        const waitTime = Math.max(0, delay - elapsed)
        if (waitTime > 0) {
          await sleep(waitTime)
        }
      }
    }

    setIsBroadcasting(false)
    abortControllerRef.current = null
  }

  const downloadCSV = () => {
    if (results.length === 0) {
      alert('No results to download')
      return
    }

    const headers = ['Index', 'RLP', 'Success', 'TxHash', 'ExplorerLink', 'Error', 'Attempts', 'Retryable', 'ChainId', 'ChainName', 'RpcUsed', 'Timestamp']
    const rows = results.map(r => [
      r.index,
      `"${r.rlp}"`,
      r.success,
      r.txHash || '',
      r.success && r.explorer && r.txHash ? `${r.explorer}${r.txHash}` : '',
      `"${(r.error || '').replace(/"/g, '""')}"`,
      r.attempts || 1,
      r.retryable ? 'yes' : 'no',
      r.chainId || '',
      r.chainName || '',
      `"${r.rpcUsed || ''}"`,
      r.timestamp
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `broadcast-results-${selectedNetwork.id}-${Date.now()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  // Group networks by type for the dropdown
  const evmNetworks = NETWORKS.filter(n => n.type === 'evm')
  const solanaNetworks = NETWORKS.filter(n => n.type === 'solana')
  const xrpNetworks = NETWORKS.filter(n => n.type === 'xrp')
  const stellarNetworks = NETWORKS.filter(n => n.type === 'stellar')
  const bitcoinNetworks = NETWORKS.filter(n => n.type === 'bitcoin' || n.type === 'bitcoincash')
  
  const getNetworkTypeLabel = () => {
    if (isSolana) return 'Solana'
    if (isXrp) return 'XRP Ledger'
    if (isStellar) return 'Stellar (XLM)'
    if (isBitcoin) return 'Bitcoin'
    return 'EVM'
  }

  const location = useLocation()

  return (
    <div className="broadcaster-page">
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
            to="/btc-safe-to-fail" 
            className={`sidebar-link ${location.pathname === '/btc-safe-to-fail' ? 'active' : ''}`}
          >
            <span className="sidebar-icon">₿</span>
            <span className="sidebar-text">BTC Safe-to-Fail</span>
          </Link>
        </div>
      </nav>
      <div className="broadcaster-container">
        <header className="broadcaster-header">
          <h1>⚡ Transaction Broadcaster</h1>
          <p>Broadcast raw transactions to EVM, Solana, Bitcoin-style chains, XRP, and Stellar.</p>
        </header>

        <section className="network-section">
          <label className="section-label">Select Network</label>
          <div className="network-selector">
            <select
              value={selectedNetwork.id}
              onChange={(e) => {
                const network = NETWORKS.find(n => n.id === e.target.value)
                handleNetworkChange(network)
              }}
              className="network-dropdown"
            >
              <optgroup label="EVM Networks">
                {evmNetworks.map(network => (
                  <option key={network.id} value={network.id}>
                    {network.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Solana">
                {solanaNetworks.map(network => (
                  <option key={network.id} value={network.id}>
                    {network.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="XRP Ledger">
                {xrpNetworks.map(network => (
                  <option key={network.id} value={network.id}>
                    {network.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Stellar (XLM)">
                {stellarNetworks.map(network => (
                  <option key={network.id} value={network.id}>
                    {network.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Bitcoin & Forks">
                {bitcoinNetworks.map(network => (
                  <option key={network.id} value={network.id}>
                    {network.name}
                  </option>
                ))}
              </optgroup>
            </select>
            
            {(selectedNetwork.id === 'custom-evm' || selectedNetwork.id === 'custom-solana' || selectedNetwork.id === 'custom-xrp') ? (
              <input
                type="text"
                value={customRpc}
                onChange={(e) => setCustomRpc(e.target.value)}
                placeholder={`Enter custom ${getNetworkTypeLabel()} RPC URL...`}
                className="custom-rpc-input"
              />
            ) : isAutoMode ? (
              <div className="rpc-display auto-mode">
                <span className="rpc-label">Mode:</span>
                <code>Auto-detect chain from transaction</code>
              </div>
            ) : (
              <div className="rpc-display">
                <span className="rpc-label">RPC:</span>
                <code>{selectedNetwork.rpc}</code>
              </div>
            )}
          </div>
          
          {isSolana && (
            <div className="network-type-badge solana">
              ◎ Solana Mode
            </div>
          )}
          
          {isXrp && (
            <div className="network-type-badge xrp">
              ✕ XRP Ledger Mode
            </div>
          )}
          
          {isStellar && (
            <div className="network-type-badge stellar">
              ✦ Stellar Mode
            </div>
          )}
          
          {isBitcoin && (
            <div className="network-type-badge bitcoin">
              ₿ Bitcoin Mode
            </div>
          )}
          
          {isAutoMode && (
            <div className="network-type-badge auto">
              🔄 Auto Mode - chains supported: {Object.keys(CHAIN_ID_MAP).length}
            </div>
          )}
        </section>

        <section className="settings-section">
          <button 
            className="settings-toggle"
            onClick={() => setShowSettings(!showSettings)}
          >
            ⚙️ Settings {showSettings ? '▼' : '▶'}
          </button>
          
          {showSettings && (
            <div className="settings-panel">
              <div className="settings-row">
                <label>Rate Limit:</label>
                <input
                  type="number"
                  value={txPerMinute}
                  onChange={(e) => setTxPerMinute(Math.max(1, parseInt(e.target.value) || 50))}
                  min="1"
                  className="settings-input rate-input"
                />
                <span className="settings-hint">
                  transactions per minute {txPerMinute > 0 && `(~${Math.round(getDelay())}ms between each)`}
                </span>
              </div>

              {isSolana && (
                <>
                  <div className="settings-divider">
                    <span>Solana Settings</span>
                  </div>

                  <div className="settings-row">
                    <label>Skip Preflight:</label>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={solanaSkipPreflight}
                        onChange={(e) => setSolanaSkipPreflight(e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <span className="settings-hint">
                      {solanaSkipPreflight ? 'Skipping preflight checks (faster, riskier)' : 'Preflight checks enabled (safer)'}
                    </span>
                  </div>
                </>
              )}

              <div className="settings-divider">
                <span>Retry Settings</span>
              </div>

              <div className="settings-row">
                <label>Max Retries:</label>
                <input
                  type="number"
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                  min="0"
                  max="10"
                  className="settings-input"
                />
                <span className="settings-hint">
                  {maxRetries === 0 ? 'No retries' : `Up to ${maxRetries} retries for rate limits/timeouts`}
                </span>
              </div>

              <div className="settings-row">
                <label>Retry Delay:</label>
                <input
                  type="number"
                  value={retryDelay}
                  onChange={(e) => setRetryDelay(Math.max(100, parseInt(e.target.value) || 1000))}
                  min="100"
                  step="100"
                  className="settings-input"
                />
                <span className="settings-hint">
                  Base delay in ms (exponential backoff)
                </span>
              </div>

              <div className="settings-info">
                <p className="est-time">
                  Est. time for {transactions.length.toLocaleString()} txs:{' '}
                  <strong>
                    {transactions.length === 0 ? '—' : 
                      formatTime((transactions.length / txPerMinute) * 60)
                    }
                  </strong>
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="input-section">
          <label className="section-label">Transaction Input</label>
          <p className="input-hint">
            {isSolana 
              ? 'Paste signed Solana transactions (one per line) - supports base64, base58, or hex format'
              : isXrp
                ? 'Paste signed XRP transaction blobs (one per line) - hex format'
                : isStellar
                  ? 'Paste signed Stellar transactions (one per line) - base64 XDR format'
                  : isBitcoin
                    ? 'Paste signed Bitcoin transactions (one per line) - raw hex format'
                    : isAutoMode
                      ? 'Paste RLP-encoded transactions from ANY chain (one per line) - chain will be auto-detected'
                      : 'Paste RLP-encoded transactions (one per line), with or without 0x prefix'
            }
          </p>
          
          <div className="input-actions">
            <button
              onClick={handlePasteFromClipboard}
              className="action-btn paste-btn"
            >
              📋 Paste from Clipboard
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="action-btn file-btn"
            >
              📁 Upload File
            </button>
            <button
              onClick={clearAll}
              className="action-btn clear-btn"
              disabled={!inputText && results.length === 0}
            >
              🗑️ Clear All
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </div>

          <div
            className="textarea-wrapper"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <textarea
              value={inputText}
              onChange={handleInputChange}
              placeholder={isSolana 
                ? "Paste or drop your signed Solana transactions here...\n\nBase64: AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAdNz...\nBase58: 4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bES...\nHex: 010000000000000000000000..."
                : "Paste or drop your RLP values here...\n\n0x02f86d01832e559d...\n02f8b18201e08259e9...\n0x02f8b00a82837c..."
              }
              className="tx-input"
              rows={8}
            />
            <div className="drop-overlay">Drop file here</div>
          </div>

          <div className="tx-count">
            {transactions.length > 0 ? (
              <span className="count-badge">
                {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} loaded
              </span>
            ) : (
              <span className="count-empty">No transactions loaded</span>
            )}
          </div>
        </section>

        <section className="broadcast-section">
          <div className="broadcast-buttons">
            <button
              onClick={handleBroadcast}
              disabled={isBroadcasting || transactions.length === 0}
              className="broadcast-btn"
            >
              {isBroadcasting ? (
                <>
                  <span className="spinner"></span>
                  Broadcasting {broadcastProgress.current}/{broadcastProgress.total}...
                </>
              ) : (
                <>🚀 Broadcast {transactions.length > 0 ? `(${transactions.length})` : ''}</>
              )}
            </button>

            {isBroadcasting && (
              <button onClick={handleStop} className="stop-btn">
                ⏹️ Stop
              </button>
            )}
          </div>

          {isBroadcasting && (
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{ width: `${(broadcastProgress.current / broadcastProgress.total) * 100}%` }}
              />
              <span className="progress-text">
                {Math.round((broadcastProgress.current / broadcastProgress.total) * 100)}%
              </span>
            </div>
          )}
        </section>

        {results.length > 0 && (
          <section className="results-section">
            <div className="results-header">
              <h2>📊 Results</h2>
              <div className="results-summary">
                <span className="success-count">✅ {successCount}</span>
                <span className="fail-count">❌ {failCount}</span>
                {results.some(r => r.attempts > 1) && (
                  <span className="retry-count">🔄 {results.filter(r => r.attempts > 1).length} retried</span>
                )}
              </div>
              <button onClick={downloadCSV} className="download-btn">
                ⬇️ Download CSV
              </button>
            </div>

            {/* Search and Filter Controls */}
            <div className="results-controls">
              <div className="search-box">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search by tx hash, chain, error, index..."
                  className="search-input"
                />
                {searchQuery && (
                  <button onClick={() => handleSearchChange('')} className="search-clear">×</button>
                )}
              </div>
              
              <div className="filter-controls">
                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusFilterChange(e.target.value)}
                  className="status-filter"
                >
                  <option value="all">All ({results.length})</option>
                  <option value="success">Success ({successCount})</option>
                  <option value="failed">Failed ({failCount})</option>
                </select>
                
                <select
                  value={resultsPerPage}
                  onChange={(e) => { setResultsPerPage(Number(e.target.value)); setResultsPage(1); }}
                  className="per-page-select"
                >
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                  <option value={250}>250 per page</option>
                  <option value={500}>500 per page</option>
                </select>
              </div>
            </div>

            {/* Results Info */}
            <div className="results-info-bar">
              {searchQuery || statusFilter !== 'all' ? (
                <span>Showing {filteredResults.length} of {results.length} results</span>
              ) : (
                <span>Showing {paginatedResults.length} of {results.length} results</span>
              )}
              {totalPages > 1 && (
                <span className="page-info">Page {resultsPage} of {totalPages}</span>
              )}
            </div>

            <div className="results-table-wrapper">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Chain</th>
                    <th>TX (truncated)</th>
                    <th>Status</th>
                    <th>Tries</th>
                    <th>Result</th>
                    <th>Explorer</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedResults.map((result, idx) => (
                    <tr key={result.index} className={`${result.success ? 'row-success' : 'row-error'} ${result.attempts > 1 ? 'row-retried' : ''}`}>
                      <td>{result.index}</td>
                      <td className="chain-cell" title={result.rpcUsed || 'Unknown RPC'}>
                        <span className="chain-badge">
                          {result.chainName || 'Unknown'}
                          {result.chainId && <span className="chain-id">({result.chainId})</span>}
                        </span>
                      </td>
                      <td className="rlp-cell">
                        <code 
                          className="clickable"
                          title="Click to copy full transaction"
                          onClick={() => copyToClipboard(result.rlp, `rlp-${result.index}`)}
                        >
                          {result.rlp.slice(0, 20)}...{result.rlp.slice(-8)}
                          {copiedId === `rlp-${result.index}` && <span className="copied-badge">Copied!</span>}
                        </code>
                      </td>
                      <td>
                        <span className={`status-badge ${result.success ? 'success' : 'error'}`}>
                          {result.success ? '✅ Success' : '❌ Failed'}
                        </span>
                        {!result.success && result.retryable && (
                          <span className="retryable-badge" title="This error type could be retried">
                            🔄
                          </span>
                        )}
                      </td>
                      <td className="attempts-cell">
                        <span className={result.attempts > 1 ? 'attempts-multiple' : ''}>
                          {result.attempts || 1}
                          {result.exhaustedRetries && <span className="exhausted-badge" title="Max retries exhausted">!</span>}
                        </span>
                      </td>
                      <td className="result-cell">
                        {result.success ? (
                          <code 
                            className="tx-hash clickable" 
                            title="Click to copy"
                            onClick={() => copyToClipboard(result.txHash, `hash-${result.index}`)}
                          >
                            {result.txHash}
                            {copiedId === `hash-${result.index}` && <span className="copied-badge">Copied!</span>}
                          </code>
                        ) : (
                          <span 
                            className="error-msg clickable" 
                            title={result.error ? `Full error: ${result.error}\n\nClick to copy` : 'Click to copy'}
                            onClick={() => copyToClipboard(result.error || '', `error-${result.index}`)}
                          >
                            {result.error?.slice(0, 40)}{result.error?.length > 40 ? '...' : ''}
                            {copiedId === `error-${result.index}` && <span className="copied-badge">Copied!</span>}
                          </span>
                        )}
                      </td>
                      <td className="explorer-cell">
                        {result.success && result.explorer && result.txHash ? (
                          <a 
                            href={`${result.explorer}${result.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tx-link"
                            title={`View on explorer`}
                          >
                            View ↗
                          </a>
                        ) : result.success ? (
                          <span className="no-explorer">—</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  onClick={() => setResultsPage(1)}
                  disabled={resultsPage === 1}
                  className="pagination-btn"
                >
                  ⏮ First
                </button>
                <button
                  onClick={() => setResultsPage(p => Math.max(1, p - 1))}
                  disabled={resultsPage === 1}
                  className="pagination-btn"
                >
                  ◀ Prev
                </button>
                
                <div className="pagination-pages">
                  {/* Show page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (resultsPage <= 3) {
                      pageNum = i + 1
                    } else if (resultsPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = resultsPage - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setResultsPage(pageNum)}
                        className={`pagination-page ${resultsPage === pageNum ? 'active' : ''}`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                
                <button
                  onClick={() => setResultsPage(p => Math.min(totalPages, p + 1))}
                  disabled={resultsPage === totalPages}
                  className="pagination-btn"
                >
                  Next ▶
                </button>
                <button
                  onClick={() => setResultsPage(totalPages)}
                  disabled={resultsPage === totalPages}
                  className="pagination-btn"
                >
                  Last ⏭
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default Broadcaster
