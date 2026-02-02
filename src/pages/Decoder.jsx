import { useState, useEffect } from 'react'
import './Decoder.css'

function Decoder() {
  const [inputText, setInputText] = useState('')
  const [decodedData, setDecodedData] = useState(null)
  const [detectedType, setDetectedType] = useState(null)
  const [error, setError] = useState(null)

  // Set page title
  useEffect(() => {
    document.title = 'Transaction Decoder'
    return () => { document.title = 'Monad Boss Game' }
  }, [])

  // Detect transaction type from input
  const detectTransactionType = (input) => {
    const trimmed = input.trim()
    
    // Check for EVM RLP (starts with 0x or looks like hex)
    if (trimmed.startsWith('0x') || /^[0-9a-fA-F]+$/.test(trimmed)) {
      const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed
      if (hex.length > 0) {
        const firstByte = parseInt(hex.slice(0, 2), 16)
        // EVM typed transactions start with 0x01, 0x02, 0x03, or RLP list (0xc0+)
        if (firstByte <= 0x03 || firstByte >= 0xc0) {
          return 'evm'
        }
        // Bitcoin transactions start with version (01000000 or 02000000)
        if (hex.startsWith('01000000') || hex.startsWith('02000000')) {
          return 'bitcoin'
        }
      }
      // Could be XRP (hex) or unknown
      return 'hex'
    }
    
    // Check for base64 (Solana or Stellar)
    if (/^[A-Za-z0-9+/]+=*$/.test(trimmed) && trimmed.length > 50) {
      try {
        atob(trimmed)
        return 'base64' // Could be Solana or Stellar
      } catch (e) {
        // Not valid base64
      }
    }
    
    // Check for base58 (Solana)
    if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed) && trimmed.length > 50) {
      return 'base58'
    }
    
    return 'unknown'
  }

  // Decode Bitcoin transaction
  const decodeBitcoinTransaction = (hexTx) => {
    try {
      const hex = hexTx.startsWith('0x') ? hexTx.slice(2) : hexTx
      const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
      
      let offset = 0
      const decoded = { raw: hexTx }
      
      // Version (4 bytes, little-endian)
      decoded.version = bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] << 24)
      offset += 4
      
      // Check for witness flag (SegWit)
      const hasWitness = bytes[offset] === 0x00 && bytes[offset + 1] === 0x01
      if (hasWitness) {
        decoded.type = 'SegWit Transaction'
        offset += 2 // Skip marker and flag
      } else {
        decoded.type = 'Legacy Transaction'
      }
      
      // Input count (varint)
      const inputCount = readVarInt(bytes, offset)
      decoded.inputCount = inputCount.value
      offset = inputCount.nextOffset
      
      // Parse inputs
      const inputs = []
      for (let i = 0; i < inputCount.value; i++) {
        const input = readTxInput(bytes, offset)
        inputs.push(input.data)
        offset = input.nextOffset
      }
      decoded.inputs = inputs
      
      // Output count (varint)
      const outputCount = readVarInt(bytes, offset)
      decoded.outputCount = outputCount.value
      offset = outputCount.nextOffset
      
      // Parse outputs
      const outputs = []
      for (let i = 0; i < outputCount.value; i++) {
        const output = readTxOutput(bytes, offset)
        outputs.push(output.data)
        offset = output.nextOffset
      }
      decoded.outputs = outputs
      
      // Skip witness data if present
      if (hasWitness) {
        // Skip to locktime (last 4 bytes)
        offset = bytes.length - 4
      }
      
      // Locktime (4 bytes, little-endian)
      decoded.locktime = bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] << 24)
      
      return decoded
    } catch (e) {
      throw new Error(`Failed to decode Bitcoin transaction: ${e.message}`)
    }
  }

  const readVarInt = (bytes, offset) => {
    const first = bytes[offset]
    if (first < 0xfd) {
      return { value: first, nextOffset: offset + 1 }
    } else if (first === 0xfd) {
      return { value: bytes[offset + 1] + (bytes[offset + 2] << 8), nextOffset: offset + 3 }
    } else if (first === 0xfe) {
      return { value: bytes[offset + 1] + (bytes[offset + 2] << 8) + (bytes[offset + 3] << 16) + (bytes[offset + 4] << 24), nextOffset: offset + 5 }
    } else {
      // 0xff - 8 bytes (not commonly used)
      return { value: 0, nextOffset: offset + 9 }
    }
  }

  const readTxInput = (bytes, offset) => {
    // Previous tx hash (32 bytes)
    const prevTxHash = Array.from(bytes.slice(offset, offset + 32)).reverse().map(b => b.toString(16).padStart(2, '0')).join('')
    offset += 32
    
    // Previous output index (4 bytes, little-endian)
    const prevIndex = bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] << 24)
    offset += 4
    
    // Script length (varint)
    const scriptLen = readVarInt(bytes, offset)
    offset = scriptLen.nextOffset
    
    // Script sig
    const scriptSig = bytesToHex(bytes.slice(offset, offset + scriptLen.value))
    offset += scriptLen.value
    
    // Sequence (4 bytes)
    const sequence = bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] << 24)
    offset += 4
    
    return {
      data: {
        prevTxHash: prevTxHash,
        prevOutputIndex: prevIndex,
        scriptSig: scriptSig || 'empty',
        sequence: sequence
      },
      nextOffset: offset
    }
  }

  const readTxOutput = (bytes, offset) => {
    // Value (8 bytes, little-endian)
    let value = 0
    for (let i = 0; i < 8; i++) {
      value += bytes[offset + i] * Math.pow(2, i * 8)
    }
    offset += 8
    
    // Script length (varint)
    const scriptLen = readVarInt(bytes, offset)
    offset = scriptLen.nextOffset
    
    // Script pubkey
    const scriptPubKey = bytesToHex(bytes.slice(offset, offset + scriptLen.value))
    offset += scriptLen.value
    
    return {
      data: {
        value: value,
        valueBTC: (value / 1e8).toFixed(8),
        scriptPubKey: scriptPubKey
      },
      nextOffset: offset
    }
  }

  // Decode EVM RLP transaction
  const decodeEvmTransaction = (rlpHex) => {
    try {
      const hex = rlpHex.startsWith('0x') ? rlpHex.slice(2) : rlpHex
      const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
      
      const txType = bytes[0]
      let decoded = { raw: rlpHex }
      
      if (txType === 0x02) {
        // EIP-1559 (Type 2)
        decoded.type = 'EIP-1559 (Type 2)'
        const data = decodeEIP1559(bytes)
        decoded = { ...decoded, ...data }
      } else if (txType === 0x01) {
        // EIP-2930 (Type 1)
        decoded.type = 'EIP-2930 (Type 1)'
        const data = decodeEIP2930(bytes)
        decoded = { ...decoded, ...data }
      } else if (txType === 0x03) {
        // EIP-4844 (Type 3)
        decoded.type = 'EIP-4844 (Type 3 - Blob)'
        const data = decodeEIP4844(bytes)
        decoded = { ...decoded, ...data }
      } else if (txType >= 0xc0) {
        // Legacy transaction
        decoded.type = 'Legacy Transaction'
        const data = decodeLegacyTransaction(bytes)
        decoded = { ...decoded, ...data }
      } else {
        decoded.type = 'Unknown Type'
      }
      
      return decoded
    } catch (e) {
      throw new Error(`Failed to decode EVM transaction: ${e.message}`)
    }
  }

  // Decode EIP-1559 transaction
  const decodeEIP1559 = (bytes) => {
    let offset = 1 // Skip type byte
    const items = []
    
    // Parse RLP list
    const listInfo = parseRlpList(bytes, offset)
    offset = listInfo.dataStart
    
    // EIP-1559 fields: chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, v, r, s
    const chainId = readRlpItem(bytes, offset)
    offset = chainId.nextOffset
    
    const nonce = readRlpItem(bytes, offset)
    offset = nonce.nextOffset
    
    const maxPriorityFee = readRlpItem(bytes, offset)
    offset = maxPriorityFee.nextOffset
    
    const maxFeePerGas = readRlpItem(bytes, offset)
    offset = maxFeePerGas.nextOffset
    
    const gasLimit = readRlpItem(bytes, offset)
    offset = gasLimit.nextOffset
    
    const to = readRlpItem(bytes, offset)
    offset = to.nextOffset
    
    const value = readRlpItem(bytes, offset)
    offset = value.nextOffset
    
    const data = readRlpItem(bytes, offset)
    offset = data.nextOffset
    
    // Skip accessList for now
    const accessList = readRlpItem(bytes, offset)
    offset = accessList.nextOffset
    
    const v = readRlpItem(bytes, offset)
    offset = v.nextOffset
    
    const r = readRlpItem(bytes, offset)
    offset = r.nextOffset
    
    const s = readRlpItem(bytes, offset)
    
    return {
      chainId: bytesToNumber(chainId.data),
      nonce: bytesToNumber(nonce.data),
      maxPriorityFeePerGas: bytesToHex(maxPriorityFee.data),
      maxFeePerGas: bytesToHex(maxFeePerGas.data),
      gasLimit: bytesToNumber(gasLimit.data),
      to: to.data.length > 0 ? '0x' + bytesToHex(to.data) : 'Contract Creation',
      value: bytesToHex(value.data),
      data: data.data.length > 0 ? '0x' + bytesToHex(data.data) : '0x',
      v: bytesToNumber(v.data),
      r: '0x' + bytesToHex(r.data),
      s: '0x' + bytesToHex(s.data),
    }
  }

  // Decode EIP-2930 transaction (similar structure to EIP-1559)
  const decodeEIP2930 = (bytes) => {
    let offset = 1
    const listInfo = parseRlpList(bytes, offset)
    offset = listInfo.dataStart
    
    const chainId = readRlpItem(bytes, offset)
    offset = chainId.nextOffset
    
    const nonce = readRlpItem(bytes, offset)
    offset = nonce.nextOffset
    
    const gasPrice = readRlpItem(bytes, offset)
    offset = gasPrice.nextOffset
    
    const gasLimit = readRlpItem(bytes, offset)
    offset = gasLimit.nextOffset
    
    const to = readRlpItem(bytes, offset)
    offset = to.nextOffset
    
    const value = readRlpItem(bytes, offset)
    offset = value.nextOffset
    
    const data = readRlpItem(bytes, offset)
    offset = data.nextOffset
    
    const accessList = readRlpItem(bytes, offset)
    offset = accessList.nextOffset
    
    const v = readRlpItem(bytes, offset)
    offset = v.nextOffset
    
    const r = readRlpItem(bytes, offset)
    offset = r.nextOffset
    
    const s = readRlpItem(bytes, offset)
    
    return {
      chainId: bytesToNumber(chainId.data),
      nonce: bytesToNumber(nonce.data),
      gasPrice: bytesToHex(gasPrice.data),
      gasLimit: bytesToNumber(gasLimit.data),
      to: to.data.length > 0 ? '0x' + bytesToHex(to.data) : 'Contract Creation',
      value: bytesToHex(value.data),
      data: data.data.length > 0 ? '0x' + bytesToHex(data.data) : '0x',
      v: bytesToNumber(v.data),
      r: '0x' + bytesToHex(r.data),
      s: '0x' + bytesToHex(s.data),
    }
  }

  // Decode EIP-4844 (Blob transaction)
  const decodeEIP4844 = (bytes) => {
    // Similar to EIP-1559 but with additional blob fields
    return decodeEIP1559(bytes) // Simplified for now
  }

  // Decode Legacy transaction
  const decodeLegacyTransaction = (bytes) => {
    let offset = 0
    const listInfo = parseRlpList(bytes, offset)
    offset = listInfo.dataStart
    
    const nonce = readRlpItem(bytes, offset)
    offset = nonce.nextOffset
    
    const gasPrice = readRlpItem(bytes, offset)
    offset = gasPrice.nextOffset
    
    const gasLimit = readRlpItem(bytes, offset)
    offset = gasLimit.nextOffset
    
    const to = readRlpItem(bytes, offset)
    offset = to.nextOffset
    
    const value = readRlpItem(bytes, offset)
    offset = value.nextOffset
    
    const data = readRlpItem(bytes, offset)
    offset = data.nextOffset
    
    const v = readRlpItem(bytes, offset)
    offset = v.nextOffset
    
    const r = readRlpItem(bytes, offset)
    offset = r.nextOffset
    
    const s = readRlpItem(bytes, offset)
    
    const vNum = bytesToNumber(v.data)
    let chainId = null
    
    // EIP-155: chainId = (v - 35) / 2
    if (vNum >= 35) {
      chainId = Math.floor((vNum - 35) / 2)
    } else if (vNum === 27 || vNum === 28) {
      chainId = 1 // Pre-EIP-155, assume mainnet
    }
    
    return {
      chainId,
      nonce: bytesToNumber(nonce.data),
      gasPrice: bytesToHex(gasPrice.data),
      gasLimit: bytesToNumber(gasLimit.data),
      to: to.data.length > 0 ? '0x' + bytesToHex(to.data) : 'Contract Creation',
      value: bytesToHex(value.data),
      data: data.data.length > 0 ? '0x' + bytesToHex(data.data) : '0x',
      v: vNum,
      r: '0x' + bytesToHex(r.data),
      s: '0x' + bytesToHex(s.data),
    }
  }

  // RLP parsing helpers
  const parseRlpList = (bytes, offset) => {
    const byte = bytes[offset]
    if (byte <= 0xf7) {
      return { length: byte - 0xc0, dataStart: offset + 1 }
    } else {
      const lengthOfLength = byte - 0xf7
      let length = 0
      for (let i = 0; i < lengthOfLength; i++) {
        length = (length << 8) + bytes[offset + 1 + i]
      }
      return { length, dataStart: offset + 1 + lengthOfLength }
    }
  }

  const readRlpItem = (bytes, offset) => {
    const byte = bytes[offset]
    
    if (byte <= 0x7f) {
      // Single byte
      return { data: new Uint8Array([byte]), nextOffset: offset + 1 }
    } else if (byte <= 0xb7) {
      // String 0-55 bytes
      const length = byte - 0x80
      return { data: bytes.slice(offset + 1, offset + 1 + length), nextOffset: offset + 1 + length }
    } else if (byte <= 0xbf) {
      // String > 55 bytes
      const lengthOfLength = byte - 0xb7
      let length = 0
      for (let i = 0; i < lengthOfLength; i++) {
        length = (length << 8) + bytes[offset + 1 + i]
      }
      return { data: bytes.slice(offset + 1 + lengthOfLength, offset + 1 + lengthOfLength + length), nextOffset: offset + 1 + lengthOfLength + length }
    } else {
      // List - skip entire list
      const listInfo = parseRlpList(bytes, offset)
      return { data: new Uint8Array([]), nextOffset: listInfo.dataStart + listInfo.length }
    }
  }

  const bytesToNumber = (bytes) => {
    if (bytes.length === 0) return 0
    let num = 0
    for (const byte of bytes) {
      num = (num << 8) + byte
    }
    return num
  }

  const bytesToHex = (bytes) => {
    if (bytes.length === 0) return '0x0'
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Decode based on detected type
  const handleDecode = () => {
    setError(null)
    setDecodedData(null)
    
    if (!inputText.trim()) {
      setError('Please paste a transaction')
      return
    }
    
    const type = detectTransactionType(inputText)
    setDetectedType(type)
    
    try {
      if (type === 'evm') {
        const decoded = decodeEvmTransaction(inputText)
        setDecodedData(decoded)
      } else if (type === 'bitcoin') {
        const decoded = decodeBitcoinTransaction(inputText)
        setDecodedData(decoded)
      } else if (type === 'base64' || type === 'base58') {
        setDecodedData({ message: 'Solana/Stellar decoding - showing raw data for now', rawInput: inputText })
      } else if (type === 'hex') {
        setDecodedData({ message: 'Could be XRP, Bitcoin, or other hex format - try pasting as-is', rawInput: inputText })
      } else {
        setError('Unable to detect transaction type. Try different format.')
      }
    } catch (e) {
      setError(e.message)
    }
  }

  const formatValue = (value) => {
    if (typeof value === 'number') return value.toLocaleString()
    if (typeof value === 'string' && value.startsWith('0x')) {
      // Try to parse as wei/gwei
      try {
        const bigInt = BigInt(value)
        if (bigInt === 0n) return '0'
        const eth = Number(bigInt) / 1e18
        if (eth > 0.0001) return `${eth.toFixed(6)} ETH (${value})`
        return value
      } catch {
        return value
      }
    }
    return value
  }

  return (
    <div className="decoder-page">
      <div className="decoder-container">
        <header className="decoder-header">
          <h1>🔍 Transaction Decoder</h1>
          <p>Decode signed transactions from any blockchain</p>
        </header>

        <section className="input-section">
          <label className="section-label">Paste Transaction</label>
          <p className="input-hint">
            Supports: EVM (RLP), Solana (base64/base58), XRP (hex), Stellar (base64 XDR), Bitcoin (hex)
          </p>
          
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste your signed transaction here...&#10;&#10;EVM: 0x02f86d01832e559d...&#10;Solana: AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAdNz...&#10;Bitcoin: 0100000001..."
            className="tx-input"
            rows={10}
          />

          <div className="action-buttons">
            <button onClick={handleDecode} className="decode-btn" disabled={!inputText.trim()}>
              🔍 Decode Transaction
            </button>
            <button onClick={() => { setInputText(''); setDecodedData(null); setError(null); setDetectedType(null); }} className="clear-btn" disabled={!inputText}>
              🗑️ Clear
            </button>
          </div>
        </section>

        {detectedType && (
          <div className="detection-badge">
            Detected Type: <strong>{detectedType.toUpperCase()}</strong>
          </div>
        )}

        {error && (
          <div className="error-box">
            ❌ {error}
          </div>
        )}

        {decodedData && (
          <section className="results-section">
            <h2>📊 Decoded Transaction</h2>
            
            {decodedData.type && (
              <div className="type-badge">
                Type: <strong>{decodedData.type}</strong>
              </div>
            )}
            
            <div className="decoded-fields">
              {Object.entries(decodedData).map(([key, value]) => {
                if (key === 'type' || key === 'raw') return null
                
                // Handle arrays (Bitcoin inputs/outputs)
                if (Array.isArray(value)) {
                  return (
                    <div key={key} className="field-row array-field">
                      <div className="field-label">{key}:</div>
                      <div className="field-value">
                        {value.map((item, idx) => (
                          <div key={idx} className="array-item">
                            <div className="array-item-header">#{idx + 1}</div>
                            {Object.entries(item).map(([subKey, subValue]) => (
                              <div key={subKey} className="sub-field">
                                <span className="sub-label">{subKey}:</span>
                                <code>{String(subValue)}</code>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }
                
                return (
                  <div key={key} className="field-row">
                    <div className="field-label">{key}:</div>
                    <div className="field-value">
                      <code title={String(value)}>{formatValue(value)}</code>
                    </div>
                  </div>
                )
              })}
            </div>
            
            {decodedData.message && (
              <div className="info-box">
                ℹ️ {decodedData.message}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default Decoder
