import { useReadContract, useWriteContract, useWatchContractEvent, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { GAME_CONTRACT_ABI, GAME_CONTRACT_ADDRESS } from '../config/gameContract'
import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { formatEther } from 'viem'

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
  const [txStatus, setTxStatus] = useState(null) // 'preparing' | 'pending' | 'submitted' | 'confirming' | 'confirmed' | 'waiting-event'
  const [inventoryVersion, setInventoryVersion] = useState(0)

  // Wait for transaction receipt
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({
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
    }
  })

  // Read global boss kills
  const { data: globalKills, refetch: refetchGlobalKills } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    functionName: 'totalBossesKilled',
  })

  // Read rake fee
  const { data: rakeFeeWei } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    functionName: 'RAKE_FEE',
  })

  // Watch for BossKilled event
  useWatchContractEvent({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    eventName: 'BossKilled',
    onLogs(logs) {
      const log = logs[0]
      if (log && log.args.player?.toLowerCase() === address?.toLowerCase()) {
        setLastEvent({
          type: 'success',
          tier: Number(log.args.tier),
          itemId: log.args.itemId?.toString(),
          baseRoll: log.args.baseRoll?.toString(),
          baseTier: Number(log.args.baseTier),
          upgraded: log.args.upgraded
        })
        refetchInventory()
        refetchBoosts()
        refetchGlobalKills()
        setInventoryVersion(v => v + 1)
      }
    }
  })

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
    } else if (txHash && isConfirmed) {
      setTxStatus('confirmed')
      // After confirmation, wait a bit for events
      setTimeout(() => {
        setTxStatus('waiting-event')
      }, 500)
    } else if (!isWriting && !txHash) {
      setTxStatus(null)
    }
  }, [isWriting, txHash, isConfirming, isConfirmed])

  // Reset status when event is received
  useEffect(() => {
    if (lastEvent && txStatus === 'waiting-event') {
      // Event received, reset transaction tracking
      setTimeout(() => {
        setTxStatus(null)
        reset()
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
  }, [reset])

  // Parse inventory
  const inventoryItems = inventory ? inventory.map(item => ({
    tier: Number(item.tier),
    id: item.id.toString()
  })) : []

  // Parse boosts
  const rarityBoost = boosts ? Number(boosts[0]) / 100 : 0 // Convert bps to percentage

  const rakeFeeMon = rakeFeeWei ? formatEther(rakeFeeWei) : '0'

  const value = {
    // Inventory
    inventory: inventoryItems,
    refetchInventory,
    inventoryVersion,
    // Stats
    rarityBoost,
    rakeFeeMon,
    globalBossesKilled: globalKills ? Number(globalKills) : 0,
    // Transaction
    killBoss,
    isKilling: isWriting || isConfirming || !!txStatus,
    txStatus,
    txHash,
    txError,
    isConfirming,
    isConfirmed,
    resetTransaction,
    // Events
    lastEvent,
    clearLastEvent: () => setLastEvent(null),
  }

  return (
    <GameContractContext.Provider value={value}>
      {children}
    </GameContractContext.Provider>
  )
}
