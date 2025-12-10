import { useReadContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { GAME_CONTRACT_ABI, GAME_CONTRACT_ADDRESS } from '../config/gameContract'
import { monad } from '../config/wagmi'
import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'
import { formatEther, decodeEventLog } from 'viem'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'

// Create context for sharing game state
const GameContractContext = createContext(null)

// Hook to access game contract context
export function useGameContract() {
  const context = useContext(GameContractContext)
  if (!context) {
    throw new Error('useGameContract must be used within a GameContractProvider')
  }
  return context
}

// Provider component
export function GameContractProvider({ children }) {
  const { address } = useAccount()
  const { primaryWallet } = useDynamicContext()
  
  // Track transaction state manually
  const [txHash, setTxHash] = useState(null)
  const [isWriting, setIsWriting] = useState(false)
  const [writeError, setWriteError] = useState(null)
  
  const [lastEvent, setLastEvent] = useState(null)
  const [txStatus, setTxStatus] = useState(null)
  const [inventoryVersion, setInventoryVersion] = useState(0)
  const processedTxRef = useRef(null)
  
  // Reset function
  const reset = useCallback(() => {
    setTxHash(null)
    setIsWriting(false)
    setWriteError(null)
  }, [])

  // Wait for transaction receipt
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt, error: receiptError } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: !!txHash,
    }
  })

  // Combine errors
  const txError = writeError || receiptError

  // Read inventory
  const { data: inventory, refetch: refetchInventory } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    functionName: 'getInventory',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    }
  })

  // Read total boosts
  const { data: boosts, refetch: refetchBoosts } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    functionName: 'getTotalBoosts',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    }
  })

  // Read global boss kills
  const { data: globalKills, refetch: refetchGlobalKills } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    functionName: 'totalBossesKilled',
    query: {
      staleTime: 60000,
      refetchOnWindowFocus: false,
    }
  })

  // Read rake fee
  const { data: rakeFeeWei } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    functionName: 'RAKE_FEE',
    query: {
      staleTime: 300000,
      refetchOnWindowFocus: false,
    }
  })

  // Process receipt to extract BossKilled event
  useEffect(() => {
    if (!receipt || !isConfirmed || !receipt.logs) return
    if (processedTxRef.current === receipt.transactionHash) return
    
    console.log('[useGameContract] Processing receipt:', receipt.transactionHash)
    processedTxRef.current = receipt.transactionHash
    
    // Find BossKilled event in logs
    for (const log of receipt.logs) {
      if (log.address?.toLowerCase() !== GAME_CONTRACT_ADDRESS.toLowerCase()) continue
      
      try {
        const decoded = decodeEventLog({
          abi: GAME_CONTRACT_ABI,
          data: log.data,
          topics: log.topics,
        })
        
        console.log('[useGameContract] Decoded event:', decoded)
        
        if (decoded.eventName === 'BossKilled') {
          const args = decoded.args
          
          if (args.player?.toLowerCase() === address?.toLowerCase()) {
            console.log('[useGameContract] BossKilled event found!')
            
            setLastEvent({
              type: 'success',
              tier: Number(args.tier),
              itemId: args.itemId?.toString(),
              baseRoll: args.baseRoll?.toString(),
              baseTier: Number(args.baseTier),
              upgraded: args.upgraded,
              transactionHash: receipt.transactionHash,
            })
            
            // Refetch data
            setTimeout(() => {
              refetchInventory()
              refetchBoosts()
              refetchGlobalKills()
              setInventoryVersion(v => v + 1)
            }, 500)
            
            break
          }
        }
      } catch (e) {
        console.log('[useGameContract] Could not decode log:', e.message)
      }
    }
  }, [receipt, isConfirmed, address, refetchInventory, refetchBoosts, refetchGlobalKills])

  // Track transaction status
  useEffect(() => {
    if (isWriting && !txHash) {
      setTxStatus('preparing')
    } else if (txHash && !isConfirming && !isConfirmed) {
      setTxStatus('submitted')
    } else if (txHash && isConfirming) {
      setTxStatus('confirming')
    } else if (txHash && isConfirmed && !lastEvent) {
      setTxStatus('waiting-event')
    } else if (txHash && isConfirmed && lastEvent) {
      setTxStatus('confirmed')
    } else if (!isWriting && !txHash && !isConfirming) {
      setTxStatus(null)
    }
  }, [isWriting, txHash, isConfirming, isConfirmed, lastEvent])

  // Reset status when event is received
  useEffect(() => {
    if (lastEvent && (txStatus === 'waiting-event' || txStatus === 'confirmed')) {
      setTimeout(() => {
        setTxStatus(null)
        reset()
        processedTxRef.current = null
      }, 1000)
    }
  }, [lastEvent, txStatus, reset])

  const killBoss = useCallback(async () => {
    if (!rakeFeeWei) {
      console.log('[killBoss] No rake fee, cannot kill boss')
      return
    }
    
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      console.log('[killBoss] No wallet connected')
      return
    }
    
    console.log('[killBoss] Starting boss kill...')
    console.log('[killBoss] Contract:', GAME_CONTRACT_ADDRESS)
    console.log('[killBoss] Value:', rakeFeeWei.toString(), 'wei')
    console.log('[killBoss] Wallet type:', primaryWallet.connector?.name)
    
    setTxStatus('preparing')
    setLastEvent(null)
    processedTxRef.current = null
    setWriteError(null)
    setIsWriting(true)
    
    try {
      // Try multiple methods to get wallet client
      let walletClient
      
      // Method 1: Try connector's getWalletClient (works for most cases)
      try {
        console.log('[killBoss] Trying connector.getWalletClient()...')
        walletClient = await primaryWallet.connector?.getWalletClient?.()
        if (walletClient) console.log('[killBoss] Got wallet client from connector')
      } catch (e) {
        console.log('[killBoss] connector.getWalletClient failed:', e.message)
      }
      
      // Method 2: Try wallet's getWalletClient with chainId
      if (!walletClient) {
        try {
          console.log('[killBoss] Trying wallet.getWalletClient("143")...')
          walletClient = await primaryWallet.getWalletClient('143')
          if (walletClient) console.log('[killBoss] Got wallet client with chainId')
        } catch (e) {
          console.log('[killBoss] wallet.getWalletClient("143") failed:', e.message)
        }
      }
      
      // Method 3: Try wallet's getWalletClient without chainId
      if (!walletClient) {
        try {
          console.log('[killBoss] Trying wallet.getWalletClient()...')
          walletClient = await primaryWallet.getWalletClient()
          if (walletClient) console.log('[killBoss] Got wallet client without chainId')
        } catch (e) {
          console.log('[killBoss] wallet.getWalletClient() failed:', e.message)
        }
      }
      
      if (!walletClient) {
        throw new Error('Could not get wallet client from any method')
      }
      
      console.log('[killBoss] Sending transaction with wallet client...')
      
      const hash = await walletClient.writeContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'killBoss',
        value: rakeFeeWei,
        chain: monad,
        account: address,
      })
      
      console.log('[killBoss] Transaction sent:', hash)
      setTxHash(hash)
    } catch (err) {
      console.error('[killBoss] Transaction error:', err)
      setWriteError(err)
      setTxStatus(null)
    } finally {
      setIsWriting(false)
    }
  }, [primaryWallet, rakeFeeWei, address])

  const resetTransaction = useCallback(() => {
    reset()
    setTxStatus(null)
    setLastEvent(null)
    processedTxRef.current = null
  }, [])

  // Parse inventory
  const inventoryItems = inventory ? inventory.map(item => ({
    tier: Number(item.tier),
    id: item.id.toString()
  })) : []

  // Parse boosts
  const rarityBoost = boosts ? Number(boosts[0]) / 100 : 0

  const rakeFeeMon = rakeFeeWei ? formatEther(rakeFeeWei) : '0'

  const value = {
    inventory: inventoryItems,
    refetchInventory,
    inventoryVersion,
    rarityBoost,
    rakeFeeMon,
    globalBossesKilled: globalKills ? Number(globalKills) : 0,
    killBoss,
    isKilling: isWriting || isConfirming || !!txStatus,
    txStatus,
    txHash,
    txError,
    isConfirming,
    isConfirmed,
    resetTransaction,
    lastEvent,
    clearLastEvent: () => setLastEvent(null),
  }

  return (
    <GameContractContext.Provider value={value}>
      {children}
    </GameContractContext.Provider>
  )
}
