import { useState, useRef, useCallback } from 'react'
import './Broadcaster.css'

const EVM_NETWORKS = [
  { id: 'ethereum', name: 'Ethereum', rpc: 'https://eth.llamarpc.com' },
  { id: 'worldchain', name: 'Worldchain', rpc: 'https://worldchain-mainnet.g.alchemy.com/public' },
  { id: 'optimism', name: 'Optimism', rpc: 'https://mainnet.optimism.io' },
  { id: 'base', name: 'Base', rpc: 'https://mainnet.base.org' },
  { id: 'arbitrum', name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc' },
  { id: 'polygon', name: 'Polygon', rpc: 'https://polygon-rpc.com' },
  { id: 'bsc', name: 'BNB Smart Chain', rpc: 'https://bsc-dataseed.binance.org' },
  { id: 'avalanche', name: 'Avalanche C-Chain', rpc: 'https://api.avax.network/ext/bc/C/rpc' },
  { id: 'fantom', name: 'Fantom', rpc: 'https://rpcapi.fantom.network' },
  { id: 'custom', name: 'Custom RPC...', rpc: '' }
]

const RATE_PRESETS = [
  { label: 'Slow (5/sec)', rps: 5, delay: 200 },
  { label: 'Medium (20/sec)', rps: 20, delay: 50 },
  { label: 'Fast (50/sec)', rps: 50, delay: 20 },
  { label: 'Blazing (100/sec)', rps: 100, delay: 10 },
  { label: 'No Limit', rps: 0, delay: 0 },
  { label: 'Custom', rps: -1, delay: -1 },
]

function Broadcaster() {
  const [selectedNetwork, setSelectedNetwork] = useState(EVM_NETWORKS[0])
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

  const normalizeRlp = (rlp) => {
    const trimmed = rlp.trim()
    if (!trimmed) return null
    return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
  }

  const parseTransactions = useCallback((text) => {
    const lines = text.split('\n')
    const txs = lines
      .map(line => normalizeRlp(line))
      .filter(tx => tx !== null && tx.length > 2)
    return txs
  }, [])

  const handleInputChange = (e) => {
    const text = e.target.value
    setInputText(text)
    setTransactions(parseTransactions(text))
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    setInputText(text)
    setTransactions(parseTransactions(text))
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setInputText(text)
      setTransactions(parseTransactions(text))
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
        setTransactions(parseTransactions(text))
      })
    }
  }, [parseTransactions])

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
    return selectedNetwork.id === 'custom' ? customRpc : selectedNetwork.rpc
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

  const broadcastTransaction = async (rlpHex, signal) => {
    const rpcUrl = getRpcUrl()
    
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_sendRawTransaction',
          params: [rlpHex]
        }),
        signal
      })

      const data = await response.json()
      
      if (data.error) {
        return {
          success: false,
          error: data.error.message || JSON.stringify(data.error),
          txHash: null
        }
      }

      return {
        success: true,
        error: null,
        txHash: data.result
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          success: false,
          error: 'Aborted',
          txHash: null
        }
      }
      return {
        success: false,
        error: err.message,
        txHash: null
      }
    }
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

      // Process batch concurrently
      const batchPromises = batch.map(async (tx, batchIdx) => {
        const globalIdx = i + batchIdx
        const result = await broadcastTransaction(tx, signal)
        return {
          index: globalIdx + 1,
          rlp: tx,
          success: result.success,
          txHash: result.txHash,
          error: result.error,
          timestamp: new Date().toISOString()
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

    const headers = ['Index', 'RLP', 'Success', 'TxHash', 'Error', 'Timestamp']
    const rows = results.map(r => [
      r.index,
      `"${r.rlp}"`,
      r.success,
      r.txHash || '',
      `"${(r.error || '').replace(/"/g, '""')}"`,
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

  return (
    <div className="broadcaster-page">
      <div className="broadcaster-container">
        <header className="broadcaster-header">
          <h1>⚡ EVM Broadcaster</h1>
          <p>Broadcast raw transactions to any EVM chain</p>
        </header>

        <section className="network-section">
          <label className="section-label">Select Network</label>
          <div className="network-selector">
            <select
              value={selectedNetwork.id}
              onChange={(e) => {
                const network = EVM_NETWORKS.find(n => n.id === e.target.value)
                setSelectedNetwork(network)
              }}
              className="network-dropdown"
            >
              {EVM_NETWORKS.map(network => (
                <option key={network.id} value={network.id}>
                  {network.name}
                </option>
              ))}
            </select>
            
            {selectedNetwork.id === 'custom' ? (
              <input
                type="text"
                value={customRpc}
                onChange={(e) => setCustomRpc(e.target.value)}
                placeholder="Enter custom RPC URL..."
                className="custom-rpc-input"
              />
            ) : (
              <div className="rpc-display">
                <span className="rpc-label">RPC:</span>
                <code>{selectedNetwork.rpc}</code>
              </div>
            )}
          </div>
        </section>

        <section className="settings-section">
          <button 
            className="settings-toggle"
            onClick={() => setShowSettings(!showSettings)}
          >
            ⚙️ Rate Limiting Settings {showSettings ? '▼' : '▶'}
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
          <p className="input-hint">Paste RLP-encoded transactions (one per line), with or without 0x prefix</p>
          
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
              placeholder="Paste or drop your RLP values here...&#10;&#10;0x02f86d01832e559d...&#10;02f8b18201e08259e9...&#10;0x02f8b00a82837c..."
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
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, idx) => (
                    <tr key={idx} className={result.success ? 'row-success' : 'row-error'}>
                      <td>{result.index}</td>
                      <td className="rlp-cell" title={result.rlp}>
                        <code>{result.rlp.slice(0, 20)}...{result.rlp.slice(-8)}</code>
                      </td>
                      <td>
                        <span className={`status-badge ${result.success ? 'success' : 'error'}`}>
                          {result.success ? '✅ Success' : '❌ Failed'}
                        </span>
                      </td>
                      <td className="result-cell">
                        {result.success ? (
                          <code className="tx-hash" title={result.txHash}>
                            {result.txHash?.slice(0, 10)}...{result.txHash?.slice(-8)}
                          </code>
                        ) : (
                          <span className="error-msg" title={result.error}>
                            {result.error?.slice(0, 50)}{result.error?.length > 50 ? '...' : ''}
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
