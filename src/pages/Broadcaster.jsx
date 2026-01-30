import { useState, useRef, useCallback } from 'react'
import './Broadcaster.css'

const NETWORKS = [
  // EVM Networks
  { id: 'auto-evm', name: '🔄 Auto (Detect Chain)', rpc: '', type: 'evm', isAuto: true },
  { id: 'ethereum', name: 'Ethereum', rpc: 'https://eth.llamarpc.com', type: 'evm', chainId: 1 },
  { id: 'worldchain', name: 'Worldchain', rpc: 'https://worldchain-mainnet.g.alchemy.com/public', type: 'evm', chainId: 480 },
  { id: 'optimism', name: 'Optimism', rpc: 'https://mainnet.optimism.io', type: 'evm', chainId: 10 },
  { id: 'base', name: 'Base', rpc: 'https://mainnet.base.org', type: 'evm', chainId: 8453 },
  { id: 'arbitrum', name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc', type: 'evm', chainId: 42161 },
  { id: 'polygon', name: 'Polygon', rpc: 'https://polygon-rpc.com', type: 'evm', chainId: 137 },
  { id: 'bsc', name: 'BNB Smart Chain', rpc: 'https://bsc-dataseed.binance.org', type: 'evm', chainId: 56 },
  { id: 'avalanche', name: 'Avalanche C-Chain', rpc: 'https://api.avax.network/ext/bc/C/rpc', type: 'evm', chainId: 43114 },
  { id: 'fantom', name: 'Fantom', rpc: 'https://rpcapi.fantom.network', type: 'evm', chainId: 250 },
  { id: 'custom-evm', name: 'Custom EVM RPC...', rpc: '', type: 'evm' },
  // Solana Networks
  { id: 'solana', name: 'Solana Mainnet (QuickNode)', rpc: 'https://delicate-misty-flower.solana-mainnet.quiknode.pro/9428bcea652ef50dc68b571c3cda0f9221534b40/', type: 'solana' },
  { id: 'custom-solana', name: 'Custom Solana RPC...', rpc: '', type: 'solana' },
]

// Chain ID to network mapping for auto-detection
const CHAIN_ID_MAP = {
  1: { name: 'Ethereum', rpc: 'https://eth.llamarpc.com' },
  10: { name: 'Optimism', rpc: 'https://mainnet.optimism.io' },
  56: { name: 'BNB Smart Chain', rpc: 'https://bsc-dataseed.binance.org' },
  137: { name: 'Polygon', rpc: 'https://polygon-rpc.com' },
  250: { name: 'Fantom', rpc: 'https://rpcapi.fantom.network' },
  480: { name: 'Worldchain', rpc: 'https://worldchain-mainnet.g.alchemy.com/public' },
  8453: { name: 'Base', rpc: 'https://mainnet.base.org' },
  42161: { name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc' },
  43114: { name: 'Avalanche C-Chain', rpc: 'https://api.avax.network/ext/bc/C/rpc' },
}

// Decode RLP to extract chain ID from EVM transaction
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
  
  // Rate limiting - simple tx per minute
  const [txPerMinute, setTxPerMinute] = useState(50)
  const abortControllerRef = useRef(null)
  const [showSettings, setShowSettings] = useState(false)
  
  // Retry settings
  const [maxRetries, setMaxRetries] = useState(3)
  const [retryDelay, setRetryDelay] = useState(1000) // Base delay for exponential backoff
  
  // Solana-specific settings
  const [solanaSkipPreflight, setSolanaSkipPreflight] = useState(false)
  
  const isSolana = selectedNetwork.type === 'solana'
  const isAutoMode = selectedNetwork.id === 'auto-evm'
  
  // Get chain info for a transaction (for auto mode)
  const getChainInfo = (txPayload) => {
    if (!isAutoMode) {
      return { 
        chainId: selectedNetwork.chainId || null, 
        chainName: selectedNetwork.name, 
        rpc: getRpcUrl() 
      }
    }
    
    const chainId = decodeRlpChainId(txPayload)
    if (chainId && CHAIN_ID_MAP[chainId]) {
      return {
        chainId,
        chainName: CHAIN_ID_MAP[chainId].name,
        rpc: CHAIN_ID_MAP[chainId].rpc
      }
    }
    
    return {
      chainId,
      chainName: chainId ? `Unknown (${chainId})` : 'Unknown',
      rpc: null
    }
  }

  const normalizeTransaction = (tx, networkType) => {
    const trimmed = tx.trim().replace(/^["']|["']$/g, '')
    if (!trimmed) return null
    
    if (networkType === 'solana') {
      // For Solana, return the raw string - encoding will be detected at broadcast time
      return trimmed
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
      } else {
        // EVM transaction
        body = {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_sendRawTransaction',
          params: [txPayload]
        }
      }
      
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal
      })

      const httpStatus = response.status
      const data = await response.json()
      
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
        rpcUsed: chainInfo.rpc
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

    const headers = ['Index', 'RLP', 'Success', 'TxHash', 'Error', 'Attempts', 'Retryable', 'ChainId', 'ChainName', 'RpcUsed', 'Timestamp']
    const rows = results.map(r => [
      r.index,
      `"${r.rlp}"`,
      r.success,
      r.txHash || '',
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

  return (
    <div className="broadcaster-page">
      <div className="broadcaster-container">
        <header className="broadcaster-header">
          <h1>⚡ {isSolana ? 'Solana' : 'EVM'} Broadcaster</h1>
          <p>Broadcast raw transactions to any {isSolana ? 'Solana cluster' : 'EVM chain'}</p>
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
            </select>
            
            {(selectedNetwork.id === 'custom-evm' || selectedNetwork.id === 'custom-solana') ? (
              <input
                type="text"
                value={customRpc}
                onChange={(e) => setCustomRpc(e.target.value)}
                placeholder={`Enter custom ${isSolana ? 'Solana' : 'EVM'} RPC URL...`}
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
          
          {isAutoMode && (
            <div className="network-type-badge auto">
              🔄 Auto Mode - chains detected: {Object.keys(CHAIN_ID_MAP).length}
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

            <div className="results-table-wrapper">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>#</th>
                    {isAutoMode && <th>Chain</th>}
                    <th>RLP (truncated)</th>
                    <th>Status</th>
                    <th>Tries</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, idx) => (
                    <tr key={idx} className={`${result.success ? 'row-success' : 'row-error'} ${result.attempts > 1 ? 'row-retried' : ''}`}>
                      <td>{result.index}</td>
                      {isAutoMode && (
                        <td className="chain-cell" title={result.rpcUsed || 'Unknown RPC'}>
                          <span className="chain-badge">
                            {result.chainName || 'Unknown'}
                            {result.chainId && <span className="chain-id">({result.chainId})</span>}
                          </span>
                        </td>
                      )}
                      <td className="rlp-cell" title={result.rlp}>
                        <code>{result.rlp.slice(0, 20)}...{result.rlp.slice(-8)}</code>
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
                          <code className="tx-hash" title={result.txHash}>
                            {result.txHash?.slice(0, 10)}...{result.txHash?.slice(-8)}
                          </code>
                        ) : (
                          <span className="error-msg" title={result.error}>
                            {result.error?.slice(0, 40)}{result.error?.length > 40 ? '...' : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

export default Broadcaster
