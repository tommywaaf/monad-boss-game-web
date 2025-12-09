import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { GAME_CONTRACT_ABI, GAME_CONTRACT_ADDRESS } from '../config/gameContract'
import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'
import { formatEther, decodeEventLog } from 'viem'

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
  const { writeContract, data: txHash, isPending: isWriting, reset, error: writeError } = useWriteContract()
  const [lastEvent, setLastEvent] = useState(null)
  const [txStatus, setTxStatus] = useState(null)
  const [inventoryVersion, setInventoryVersion] = useState(0)
  const processedTxRef = useRef(null) // Track which tx we've processed

  // Wait for transaction receipt - get the full receipt data
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError, data: receipt } = useWaitForTransactionReceipt({
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

  // Parse BossKilled event from transaction receipt
  useEffect(() => {
    if (!receipt || !isConfirmed || !receipt.logs) return
    if (processedTxRef.current === receipt.transactionHash) return // Already processed
    
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
          
          // Check if this event is for the current user
          if (args.player?.toLowerCase() === address?.toLowerCase()) {
            console.log('[useGameContract] BossKilled event found for current user!')
            
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
        // Not a BossKilled event or couldn't decode, continue
        console.log('[useGameContract] Could not decode log:', e.message)
      }
    }
  }, [receipt, isConfirmed, address, refetchInventory, refetchBoosts, refetchGlobalKills])

  // Track transaction status
  useEffect(() => {
    if (isWriting && !txHash) {
      setTxStatus('preparing')
    } else if (isWriting && txHash) {
      setTxStatus('pending')
    } else if (txHash && !isConfirming && !isConfirmed) {
      setTxStatus('submitted')
    } else if (txHash && isConfirming) {
      setTxStatus('confirming')
    } else if (txHash && isConfirmed && !lastEvent) {
      setTxStatus('confirmed')
      // After confirmation, wait a bit for event processing
      setTimeout(() => {
        setTxStatus('waiting-event')
      }, 500)
    } else if (!isWriting && !txHash) {
      setTxStatus(null)
    }
  }, [isWriting, txHash, isConfirming, isConfirmed, lastEvent])

  // Reset status when event is received
  useEffect(() => {
    if (lastEvent && (txStatus === 'waiting-event' || txStatus === 'confirmed')) {
      // Event received, reset transaction tracking
      setTimeout(() => {
        setTxStatus(null)
        reset()
        processedTxRef.current = null
      }, 1000)
    }
  }, [lastEvent, txStatus, reset])

  const killBoss = useCallback(() => {
    if (!rakeFeeWei) {
      console.log('[killBoss] No rake fee, cannot kill boss')
      return
    }
    console.log('[killBoss] Starting boss kill...')
    console.log('[killBoss] Contract:', GAME_CONTRACT_ADDRESS)
    console.log('[killBoss] Value:', rakeFeeWei.toString(), 'wei')
    setTxStatus('preparing')
    setLastEvent(null)
    processedTxRef.current = null
    writeContract({
      address: GAME_CONTRACT_ADDRESS,
      abi: GAME_CONTRACT_ABI,
      functionName: 'killBoss',
      value: rakeFeeWei,
    })
  }, [writeContract, rakeFeeWei])

  const resetTransaction = useCallback(() => {
    reset()
    setTxStatus(null)
    setLastEvent(null)
    processedTxRef.current = null
  }, [reset])

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
