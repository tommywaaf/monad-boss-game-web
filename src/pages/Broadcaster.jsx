import { useState, useRef, useCallback } from 'react'
import './Broadcaster.css'

const NETWORKS = [
  // EVM Networks
  { id: 'ethereum', name: 'Ethereum', rpc: 'https://eth.llamarpc.com', type: 'evm' },
  { id: 'worldchain', name: 'Worldchain', rpc: 'https://worldchain-mainnet.g.alchemy.com/public', type: 'evm' },
  { id: 'optimism', name: 'Optimism', rpc: 'https://mainnet.optimism.io', type: 'evm' },
  { id: 'base', name: 'Base', rpc: 'https://mainnet.base.org', type: 'evm' },
  { id: 'arbitrum', name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc', type: 'evm' },
  { id: 'polygon', name: 'Polygon', rpc: 'https://polygon-rpc.com', type: 'evm' },
  { id: 'bsc', name: 'BNB Smart Chain', rpc: 'https://bsc-dataseed.binance.org', type: 'evm' },
  { id: 'avalanche', name: 'Avalanche C-Chain', rpc: 'https://api.avax.network/ext/bc/C/rpc', type: 'evm' },
  { id: 'fantom', name: 'Fantom', rpc: 'https://rpcapi.fantom.network', type: 'evm' },
  { id: 'custom-evm', name: 'Custom EVM RPC...', rpc: '', type: 'evm' },
  // Solana Networks
  { id: 'solana', name: 'Solana Mainnet (QuickNode)', rpc: 'https://delicate-misty-flower.solana-mainnet.quiknode.pro/9428bcea652ef50dc68b571c3cda0f9221534b40/', type: 'solana' },
  { id: 'custom-solana', name: 'Custom Solana RPC...', rpc: '', type: 'solana' },
]

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

const RATE_PRESETS = [
  { label: 'Slow (5/sec)', rps: 5, delay: 200 },
  { label: 'Medium (20/sec)', rps: 20, delay: 50 },
  { label: 'Fast (50/sec)', rps: 50, delay: 20 },
  { label: 'Blazing (100/sec)', rps: 100, delay: 10 },
  { label: 'No Limit', rps: 0, delay: 0 },
  { label: 'Custom', rps: -1, delay: -1 },
]

function Broadcaster() {
  const [selectedNetwork, setSelectedNetwork] = useState(NETWORKS[0])
  const [customRpc, setCustomRpc] = useState('')
  const [inputText, setInputText] = useState('')
  const [transactions, setTransactions] = useState([])
  const [results, setResults] = useState([])
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  const [broadcastProgress, setBroadcastProgress] = useState({ current: 0, total: 0 })
  const fileInputRef = useRef(null)
  
  // Rate limiting state
  const [ratePreset, setRatePreset] = useState(RATE_PRESETS[1]) // Medium by default
  const [customDelay, setCustomDelay] = useState(50)
  const [batchSize, setBatchSize] = useState(1) // Concurrent requests
  const abortControllerRef = useRef(null)
  const [showSettings, setShowSettings] = useState(false)
  
  // Retry settings
  const [maxRetries, setMaxRetries] = useState(3)
  const [retryDelay, setRetryDelay] = useState(1000) // Base delay for exponential backoff
  
  // Solana-specific settings
  const [solanaSkipPreflight, setSolanaSkipPreflight] = useState(false)
  const [solanaMaxRetries, setSolanaMaxRetries] = useState(3)
  
  const isSolana = selectedNetwork.type === 'solana'

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
    if (ratePreset.rps === -1) return customDelay
    return ratePreset.delay
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

  const broadcastTransaction = async (txPayload, signal) => {
    const rpcUrl = getRpcUrl()
    
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
              maxRetries: solanaMaxRetries,
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

  const broadcastWithRetry = async (rlpHex, signal, onRetry) => {
    let lastResult = null
    let attempts = 0
    
    while (attempts <= maxRetries) {
      if (signal.aborted) {
        return { ...lastResult, attempts, aborted: true }
      }
      
      lastResult = await broadcastTransaction(rlpHex, signal)
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

    const rpcUrl = getRpcUrl()
    if (!rpcUrl) {
      alert('Please enter a valid RPC URL')
      return
    }

    // Create abort controller
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setIsBroadcasting(true)
    setBroadcastProgress({ current: 0, total: transactions.length })
    setResults([])

    const newResults = []
    const delay = getDelay()
    const concurrency = batchSize

    // Process in batches with rate limiting
    for (let i = 0; i < transactions.length; i += concurrency) {
      if (signal.aborted) break

      const batch = transactions.slice(i, i + concurrency)
      const batchStartTime = Date.now()

      // Process batch concurrently with retry support
      const batchPromises = batch.map(async (tx, batchIdx) => {
        const globalIdx = i + batchIdx
        const result = await broadcastWithRetry(tx, signal)
        return {
          index: globalIdx + 1,
          rlp: tx,
          success: result.success,
          txHash: result.txHash,
          error: result.error,
          timestamp: new Date().toISOString(),
          attempts: result.attempts || 1,
          retryable: result.retryable,
          exhaustedRetries: result.exhaustedRetries
        }
      })

      const batchResults = await Promise.all(batchPromises)
      newResults.push(...batchResults)
      
      setBroadcastProgress({ current: Math.min(i + concurrency, transactions.length), total: transactions.length })
      setResults([...newResults])

      // Rate limiting delay (only if not last batch and delay > 0)
      if (delay > 0 && i + concurrency < transactions.length && !signal.aborted) {
        const elapsed = Date.now() - batchStartTime
        const waitTime = Math.max(0, delay * concurrency - elapsed)
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

    const headers = ['Index', 'RLP', 'Success', 'TxHash', 'Error', 'Attempts', 'Retryable', 'Timestamp']
    const rows = results.map(r => [
      r.index,
      `"${r.rlp}"`,
      r.success,
      r.txHash || '',
      `"${(r.error || '').replace(/"/g, '""')}"`,
      r.attempts || 1,
      r.retryable ? 'yes' : 'no',
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
        </section>

        <section className="settings-section">
          <button 
            className="settings-toggle"
            onClick={() => setShowSettings(!showSettings)}
          >
            ⚙️ {isSolana ? 'Solana & Rate Limiting' : 'Rate Limiting'} Settings {showSettings ? '▼' : '▶'}
          </button>
          
          {showSettings && (
            <div className="settings-panel">
              <div className="settings-row">
                <label>Rate Preset:</label>
                <select
                  value={ratePreset.label}
                  onChange={(e) => {
                    const preset = RATE_PRESETS.find(p => p.label === e.target.value)
                    setRatePreset(preset)
                  }}
                  className="settings-select"
                >
                  {RATE_PRESETS.map(preset => (
                    <option key={preset.label} value={preset.label}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              {ratePreset.rps === -1 && (
                <div className="settings-row">
                  <label>Custom Delay (ms):</label>
                  <input
                    type="number"
                    value={customDelay}
                    onChange={(e) => setCustomDelay(Math.max(0, parseInt(e.target.value) || 0))}
                    min="0"
                    className="settings-input"
                  />
                  <span className="settings-hint">
                    {customDelay > 0 ? `≈ ${Math.round(1000 / customDelay)} req/sec` : 'No delay'}
                  </span>
                </div>
              )}

              <div className="settings-row">
                <label>Batch Size:</label>
                <input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  min="1"
                  max="100"
                  className="settings-input"
                />
                <span className="settings-hint">
                  Concurrent requests (1 = sequential)
                </span>
              </div>

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
                  Base delay in ms (uses exponential backoff: {retryDelay}ms → {retryDelay * 2}ms → {retryDelay * 4}ms)
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

                  <div className="settings-row">
                    <label>RPC Max Retries:</label>
                    <input
                      type="number"
                      value={solanaMaxRetries}
                      onChange={(e) => setSolanaMaxRetries(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                      min="0"
                      max="10"
                      className="settings-input"
                    />
                    <span className="settings-hint">
                      Solana RPC-level retries (separate from our retry logic)
                    </span>
                  </div>
                </>
              )}

              <div className="settings-info">
                <p>
                  <strong>Current config:</strong>{' '}
                  {ratePreset.rps === 0 ? (
                    <span className="warn">No rate limiting - may hit RPC limits!</span>
                  ) : (
                    <>
                      ~{batchSize > 1 
                        ? `${Math.round(1000 / getDelay() * batchSize)} req/sec (${batchSize} concurrent)`
                        : `${ratePreset.rps === -1 ? Math.round(1000 / customDelay) : ratePreset.rps} req/sec`
                      }
                    </>
                  )}
                </p>
                <p className="est-time">
                  Est. time for {transactions.length.toLocaleString()} txs:{' '}
                  <strong>
                    {transactions.length === 0 ? '—' : 
                      ratePreset.rps === 0 ? '< 1 min (no throttling)' :
                      formatTime(Math.ceil(transactions.length / batchSize) * getDelay() / 1000)
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
