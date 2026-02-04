import { useState, useEffect } from 'react'
import { createPublicClient, http, recoverAddress, keccak256 } from 'viem'
import './Simulator.css'

// EVM Networks (same as Broadcaster)
const EVM_NETWORKS = [
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

// Decode RLP to extract chain ID from EVM transaction
const decodeRlpChainId = (rlpHex) => {
  try {
    const hex = rlpHex.startsWith('0x') ? rlpHex.slice(2) : rlpHex
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
    
    const txType = bytes[0]
    
    if (txType === 0x01 || txType === 0x02 || txType === 0x03) {
      // Typed transaction - chain ID is first item after type byte
      return decodeRlpItemForChainId(bytes, 1)
    } else if (txType >= 0xc0) {
      // Legacy transaction - chain ID derived from v value
      return decodeLegacyChainId(bytes)
    }
    
    return null
  } catch (e) {
    console.error('Failed to decode RLP:', e)
    return null
  }
}

// Decode RLP item to get chain ID (for typed transactions)
const decodeRlpItemForChainId = (bytes, offset) => {
  const listByte = bytes[offset]
  let listStart = offset + 1
  let listLength = 0
  
  if (listByte <= 0xf7) {
    listLength = listByte - 0xc0
  } else {
    const lengthOfLength = listByte - 0xf7
    listLength = 0
    for (let i = 0; i < lengthOfLength; i++) {
      listLength = (listLength << 8) + bytes[listStart + i]
    }
    listStart += lengthOfLength
  }
  
  const chainIdByte = bytes[listStart]
  let chainId = 0
  
  if (chainIdByte <= 0x7f) {
    chainId = chainIdByte
  } else if (chainIdByte <= 0xb7) {
    const strLength = chainIdByte - 0x80
    for (let i = 0; i < strLength; i++) {
      chainId = (chainId << 8) + bytes[listStart + 1 + i]
    }
  }
  
  return chainId
}

// Decode legacy transaction to get chain ID from v value
const decodeLegacyChainId = (bytes) => {
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
  
  if (v === 27 || v === 28) {
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
    return offset + 1
  } else if (byte <= 0xb7) {
    return offset + 1 + (byte - 0x80)
  } else if (byte <= 0xbf) {
    const lengthOfLength = byte - 0xb7
    let strLength = 0
    for (let i = 0; i < lengthOfLength; i++) {
      strLength = (strLength << 8) + bytes[offset + 1 + i]
    }
    return offset + 1 + lengthOfLength + strLength
  } else if (byte <= 0xf7) {
    return offset + 1 + (byte - 0xc0)
  } else {
    const lengthOfLength = byte - 0xf7
    let listLength = 0
    for (let i = 0; i < lengthOfLength; i++) {
      listLength = (listLength << 8) + bytes[offset + 1 + i]
    }
    return offset + 1 + lengthOfLength + listLength
  }
}

function Simulator() {
  const [inputText, setInputText] = useState('')
  const [decodedData, setDecodedData] = useState(null)
  const [simulationResult, setSimulationResult] = useState(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [error, setError] = useState(null)
  const [selectedNetwork, setSelectedNetwork] = useState(EVM_NETWORKS[0])
  const [customRpc, setCustomRpc] = useState('')
  const [detectedChainInfo, setDetectedChainInfo] = useState(null)

  // Set page title
  useEffect(() => {
    document.title = 'Transaction Simulator'
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
      }
      return 'hex'
    }
    
    return 'unknown'
  }

  // RLP parsing helpers (reused from Decoder)
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
      return { data: new Uint8Array([byte]), nextOffset: offset + 1 }
    } else if (byte <= 0xb7) {
      const length = byte - 0x80
      return { data: bytes.slice(offset + 1, offset + 1 + length), nextOffset: offset + 1 + length }
    } else if (byte <= 0xbf) {
      const lengthOfLength = byte - 0xb7
      let length = 0
      for (let i = 0; i < lengthOfLength; i++) {
        length = (length << 8) + bytes[offset + 1 + i]
      }
      return { data: bytes.slice(offset + 1 + lengthOfLength, offset + 1 + lengthOfLength + length), nextOffset: offset + 1 + lengthOfLength + length }
    } else {
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

  // Decode EIP-1559 transaction
  const decodeEIP1559 = (bytes) => {
    let offset = 1
    const listInfo = parseRlpList(bytes, offset)
    offset = listInfo.dataStart
    
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
      to: to.data.length > 0 ? '0x' + bytesToHex(to.data) : null,
      value: bytesToHex(value.data),
      data: data.data.length > 0 ? '0x' + bytesToHex(data.data) : '0x',
      v: bytesToNumber(v.data),
      r: '0x' + bytesToHex(r.data),
      s: '0x' + bytesToHex(s.data),
    }
  }

  // Decode EIP-2930 transaction
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
      to: to.data.length > 0 ? '0x' + bytesToHex(to.data) : null,
      value: bytesToHex(value.data),
      data: data.data.length > 0 ? '0x' + bytesToHex(data.data) : '0x',
      v: bytesToNumber(v.data),
      r: '0x' + bytesToHex(r.data),
      s: '0x' + bytesToHex(s.data),
    }
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
    
    if (vNum >= 35) {
      chainId = Math.floor((vNum - 35) / 2)
    } else if (vNum === 27 || vNum === 28) {
      chainId = 1
    }
    
    return {
      chainId,
      nonce: bytesToNumber(nonce.data),
      gasPrice: bytesToHex(gasPrice.data),
      gasLimit: bytesToNumber(gasLimit.data),
      to: to.data.length > 0 ? '0x' + bytesToHex(to.data) : null,
      value: bytesToHex(value.data),
      data: data.data.length > 0 ? '0x' + bytesToHex(data.data) : '0x',
      v: vNum,
      r: '0x' + bytesToHex(r.data),
      s: '0x' + bytesToHex(s.data),
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
        decoded.type = 'EIP-1559 (Type 2)'
        const data = decodeEIP1559(bytes)
        decoded = { ...decoded, ...data }
      } else if (txType === 0x01) {
        decoded.type = 'EIP-2930 (Type 1)'
        const data = decodeEIP2930(bytes)
        decoded = { ...decoded, ...data }
      } else if (txType === 0x03) {
        decoded.type = 'EIP-4844 (Type 3 - Blob)'
        const data = decodeEIP1559(bytes) // Simplified
        decoded = { ...decoded, ...data }
      } else if (txType >= 0xc0) {
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

  // Recover sender address from transaction
  const recoverSenderAddress = async (decoded) => {
    try {
      const rawTx = decoded.raw.startsWith('0x') ? decoded.raw : `0x${decoded.raw}`
      const txBytes = new Uint8Array(rawTx.slice(2).match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
      
      // Determine transaction type
      const txType = txBytes[0]
      
      let hash
      if (txType <= 0x03 && txType > 0) {
        // Typed transaction (EIP-2718): hash = keccak256(0x01 || 0x02 || 0x03 || rlp(tx))
        // The raw transaction already includes the type byte, so we hash it directly
        hash = keccak256(rawTx)
      } else {
        // Legacy transaction: hash = keccak256(rlp(tx))
        hash = keccak256(rawTx)
      }
      
      // Recover address from hash and signature
      // For typed transactions, v needs adjustment
      let v = BigInt(decoded.v)
      if (txType <= 0x03 && txType > 0) {
        // Typed transactions: v is 0 or 1, need to add 27 for recovery
        if (v === 0n || v === 1n) {
          v = v + 27n
        }
      }
      
      const address = await recoverAddress({
        hash,
        r: decoded.r,
        s: decoded.s,
        v: v,
      })
      
      return address
    } catch (e) {
      console.error('Failed to recover address:', e)
      // Try alternative: use the raw transaction hash directly
      try {
        const rawTx = decoded.raw.startsWith('0x') ? decoded.raw : `0x${decoded.raw}`
        const hash = keccak256(rawTx)
        const address = await recoverAddress({
          hash,
          r: decoded.r,
          s: decoded.s,
          v: BigInt(decoded.v),
        })
        return address
      } catch (e2) {
        console.error('Alternative recovery also failed:', e2)
        return null
      }
    }
  }

  // Get RPC URL based on selected network or detected chain
  const getRpcUrl = () => {
    if (selectedNetwork.id === 'custom-evm') {
      return customRpc
    }
    
    if (selectedNetwork.isAuto && detectedChainInfo) {
      return detectedChainInfo.rpc
    }
    
    if (selectedNetwork.isAuto) {
      return null // Need to detect first
    }
    
    return selectedNetwork.rpc
  }

  // Get chain info for a transaction (for auto mode)
  const getChainInfo = (rlpHex) => {
    if (!selectedNetwork.isAuto) {
      return {
        chainId: selectedNetwork.chainId || null,
        chainName: selectedNetwork.name,
        rpc: getRpcUrl(),
        explorer: selectedNetwork.explorer || null
      }
    }
    
    const chainId = decodeRlpChainId(rlpHex)
    if (chainId && CHAIN_ID_MAP[chainId]) {
      return {
        chainId,
        chainName: CHAIN_ID_MAP[chainId].name,
        rpc: CHAIN_ID_MAP[chainId].rpc,
        explorer: CHAIN_ID_MAP[chainId].explorer
      }
    }
    
    return {
      chainId,
      chainName: chainId ? `Unknown (${chainId})` : 'Unknown',
      rpc: null,
      explorer: null
    }
  }

  // Simulate transaction using eth_call
  const simulateTransaction = async (decoded) => {
    setIsSimulating(true)
    setSimulationResult(null)
    setError(null)

    try {
      // Get chain info (for auto mode, this decodes the tx)
      const chainInfo = getChainInfo(decoded.raw)
      const rpcUrl = chainInfo.rpc || getRpcUrl()
      
      if (!rpcUrl) {
        throw new Error('No RPC URL available. Please select a network or ensure the transaction contains a valid chain ID.')
      }

      // Try to recover sender address (optional - simulation can work without it)
      let from = await recoverSenderAddress(decoded)
      if (!from) {
        console.warn('Could not recover sender address, simulation may still work')
        // For eth_call, we can try without 'from' or use a zero address
        from = '0x0000000000000000000000000000000000000000'
      }

      // Create public client
      const client = createPublicClient({
        transport: http(rpcUrl),
      })

      // Get current block number for simulation
      const blockNumber = await client.getBlockNumber().catch(() => 'latest')

      // Prepare transaction for simulation
      const tx = {
        from: from,
        to: decoded.to,
        value: decoded.value !== '0x0' && decoded.value !== '0x' ? BigInt(decoded.value) : undefined,
        data: decoded.data !== '0x' ? decoded.data : undefined,
        gas: BigInt(decoded.gasLimit || 0),
      }

      // Add gas price fields based on transaction type
      if (decoded.gasPrice) {
        tx.gasPrice = BigInt(decoded.gasPrice)
      } else if (decoded.maxFeePerGas) {
        tx.maxFeePerGas = BigInt(decoded.maxFeePerGas)
        if (decoded.maxPriorityFeePerGas) {
          tx.maxPriorityFeePerGas = BigInt(decoded.maxPriorityFeePerGas)
        }
      }

      // Perform eth_call simulation
      const result = await client.call({
        ...tx,
        blockNumber,
      })

      // Get additional info
      let gasEstimate = null
      try {
        gasEstimate = await client.estimateGas({
          ...tx,
        })
      } catch (e) {
        console.warn('Gas estimation failed:', e)
      }

      // Get code at address (to check if it's a contract)
      let code = null
      if (decoded.to) {
        try {
          code = await client.getBytecode({ address: decoded.to })
        } catch (e) {
          console.warn('Failed to get code:', e)
        }
      }

      // Get balance of sender
      let balance = null
      try {
        balance = await client.getBalance({ address: from })
      } catch (e) {
        console.warn('Failed to get balance:', e)
      }

      setSimulationResult({
        success: true,
        returnData: result.data || '0x',
        gasUsed: result.gasUsed || null,
        gasEstimate: gasEstimate || null,
        from,
        to: decoded.to,
        isContract: code && code !== '0x',
        codeLength: code && code !== '0x' ? (code.length - 2) / 2 : 0,
        balance: balance ? balance.toString() : null,
        blockNumber: blockNumber.toString(),
        chainId: chainInfo.chainId,
        chainName: chainInfo.chainName,
        rpcUsed: rpcUrl,
        explorer: chainInfo.explorer,
      })

      // Update decoded data with sender
      setDecodedData({
        ...decoded,
        from,
      })
    } catch (e) {
      setError(`Simulation failed: ${e.message}`)
      setSimulationResult({
        success: false,
        error: e.message,
      })
    } finally {
      setIsSimulating(false)
    }
  }

  // Handle decode and simulate
  const handleSimulate = async () => {
    setError(null)
    setDecodedData(null)
    setSimulationResult(null)
    setDetectedChainInfo(null)
    
    if (!inputText.trim()) {
      setError('Please paste a signed RLP transaction')
      return
    }
    
    const type = detectTransactionType(inputText)
    
    if (type !== 'evm') {
      setError('Only EVM RLP transactions are supported for simulation')
      return
    }
    
    try {
      const decoded = decodeEvmTransaction(inputText)
      setDecodedData(decoded)
      
      // Auto-detect chain if in auto mode
      if (selectedNetwork.isAuto) {
        const chainInfo = getChainInfo(inputText.trim())
        setDetectedChainInfo(chainInfo)
        
        if (!chainInfo.rpc) {
          setError(`Could not detect chain ID or chain ID ${chainInfo.chainId || 'unknown'} is not supported. Please select a specific network.`)
          return
        }
      }
      
      // Automatically simulate after decoding
      await simulateTransaction(decoded)
    } catch (e) {
      setError(e.message)
    }
  }

  const formatValue = (value) => {
    if (typeof value === 'number') return value.toLocaleString()
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'string' && value.startsWith('0x')) {
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

  const formatHex = (hex) => {
    if (!hex || hex === '0x' || hex === '0x0') return '0x'
    if (hex.length > 66) {
      return `${hex.slice(0, 34)}...${hex.slice(-32)} (${(hex.length - 2) / 2} bytes)`
    }
    return hex
  }

  return (
    <div className="simulator-page">
      <div className="simulator-container">
        <header className="simulator-header">
          <h1>⚡ Transaction Simulator</h1>
          <p>Simulate signed EVM transactions using eth_call</p>
        </header>

        <section className="network-section">
          <label className="section-label">Select Network</label>
          <div className="network-selector">
            <select
              value={selectedNetwork.id}
              onChange={(e) => {
                const network = EVM_NETWORKS.find(n => n.id === e.target.value)
                setSelectedNetwork(network)
                setDetectedChainInfo(null)
              }}
              className="network-dropdown"
            >
              {EVM_NETWORKS.map(network => (
                <option key={network.id} value={network.id}>
                  {network.name}
                </option>
              ))}
            </select>
            
            {selectedNetwork.id === 'custom-evm' ? (
              <input
                type="text"
                value={customRpc}
                onChange={(e) => setCustomRpc(e.target.value)}
                placeholder="Enter custom EVM RPC URL..."
                className="custom-rpc-input"
              />
            ) : selectedNetwork.isAuto ? (
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
          
          {selectedNetwork.isAuto && (
            <div className="network-type-badge auto">
              🔄 Auto Mode - {Object.keys(CHAIN_ID_MAP).length} chains supported
            </div>
          )}
          
          {detectedChainInfo && (
            <div className="detected-chain-info">
              <span className="detected-label">Detected Chain:</span>
              <span className="detected-chain-name">{detectedChainInfo.chainName}</span>
              {detectedChainInfo.chainId && (
                <span className="detected-chain-id">(Chain ID: {detectedChainInfo.chainId})</span>
              )}
            </div>
          )}
        </section>

        <section className="input-section">
          <label className="section-label">Paste Signed RLP Transaction</label>
          <p className="input-hint">
            Paste a signed EVM transaction in RLP format (hex). The simulator will decode it and run eth_call to simulate execution.
          </p>
          
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={selectedNetwork.isAuto 
              ? "Paste your signed RLP transaction here...&#10;&#10;The chain will be auto-detected from the transaction.&#10;&#10;Example: 0x02f86d01832e559d..."
              : "Paste your signed RLP transaction here...&#10;&#10;Example: 0x02f86d01832e559d..."
            }
            className="tx-input"
            rows={10}
          />

          <div className="action-buttons">
            <button 
              onClick={handleSimulate} 
              className="simulate-btn" 
              disabled={!inputText.trim() || isSimulating}
            >
              {isSimulating ? '⏳ Simulating...' : '⚡ Simulate Transaction'}
            </button>
            <button 
              onClick={() => { 
                setInputText('')
                setDecodedData(null)
                setSimulationResult(null)
                setError(null)
              }} 
              className="clear-btn" 
              disabled={!inputText || isSimulating}
            >
              🗑️ Clear
            </button>
          </div>
        </section>

        {error && (
          <div className="error-box">
            ❌ {error}
          </div>
        )}

        {decodedData && (
          <section className="results-section">
            <h2>📊 Decoded Transaction</h2>
            
            <div className="type-badge">
              Type: <strong>{decodedData.type}</strong>
            </div>
            
            <div className="decoded-fields">
              {Object.entries(decodedData).map(([key, value]) => {
                if (key === 'type' || key === 'raw') return null
                
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
          </section>
        )}

        {simulationResult && (
          <section className="results-section">
            <h2>🎯 Simulation Results</h2>
            
            <div className={`status-badge ${simulationResult.success ? 'success' : 'error'}`}>
              {simulationResult.success ? '✅ Simulation Successful' : '❌ Simulation Failed'}
            </div>

            {simulationResult.success ? (
              <div className="decoded-fields">
                <div className="field-row">
                  <div className="field-label">From:</div>
                  <div className="field-value">
                    <code>{simulationResult.from}</code>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field-label">To:</div>
                  <div className="field-value">
                    <code>{simulationResult.to || 'Contract Creation'}</code>
                  </div>
                </div>

                {simulationResult.to && (
                  <div className="field-row">
                    <div className="field-label">Is Contract:</div>
                    <div className="field-value">
                      <code>{simulationResult.isContract ? 'Yes' : 'No'}</code>
                      {simulationResult.isContract && (
                        <span className="info-text"> ({simulationResult.codeLength} bytes)</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="field-row">
                  <div className="field-label">Return Data:</div>
                  <div className="field-value">
                    <code>{formatHex(simulationResult.returnData)}</code>
                  </div>
                </div>

                {simulationResult.gasUsed !== null && (
                  <div className="field-row">
                    <div className="field-label">Gas Used:</div>
                    <div className="field-value">
                      <code>{simulationResult.gasUsed.toString()}</code>
                    </div>
                  </div>
                )}

                {simulationResult.gasEstimate !== null && (
                  <div className="field-row">
                    <div className="field-label">Gas Estimate:</div>
                    <div className="field-value">
                      <code>{simulationResult.gasEstimate.toString()}</code>
                    </div>
                  </div>
                )}

                {simulationResult.balance !== null && (
                  <div className="field-row">
                    <div className="field-label">Sender Balance:</div>
                    <div className="field-value">
                      <code>{formatValue(`0x${BigInt(simulationResult.balance).toString(16)}`)}</code>
                    </div>
                  </div>
                )}

                <div className="field-row">
                  <div className="field-label">Block Number:</div>
                  <div className="field-value">
                    <code>{simulationResult.blockNumber}</code>
                  </div>
                </div>

                {simulationResult.chainId && (
                  <div className="field-row">
                    <div className="field-label">Chain ID:</div>
                    <div className="field-value">
                      <code>{simulationResult.chainId}</code>
                    </div>
                  </div>
                )}

                {simulationResult.chainName && (
                  <div className="field-row">
                    <div className="field-label">Chain:</div>
                    <div className="field-value">
                      <code>{simulationResult.chainName}</code>
                    </div>
                  </div>
                )}

                {simulationResult.rpcUsed && (
                  <div className="field-row">
                    <div className="field-label">RPC Used:</div>
                    <div className="field-value">
                      <code>{simulationResult.rpcUsed}</code>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="error-details">
                <p><strong>Error:</strong> {simulationResult.error}</p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default Simulator
