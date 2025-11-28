import { useReadContract, useWriteContract, useWatchContractEvent, useWaitForTransactionReceipt } from 'wagmi'
import { useAccount } from 'wagmi'
import { GAME_CONTRACT_ABI, GAME_CONTRACT_ADDRESS } from '../config/gameContract'
import { useState, useEffect, useCallback } from 'react'
import { formatEther } from 'viem'

export function useGameContract() {
  const { address } = useAccount()
  const { writeContract, data: txHash, isPending: isWriting, error: writeError, reset } = useWriteContract()
  const [lastEvent, setLastEvent] = useState(null)
  const [txStatus, setTxStatus] = useState(null) // 'preparing' | 'pending' | 'submitted' | 'confirming' | 'confirmed' | 'waiting-event' | 'failed'
  
  // Wait for transaction receipt
  const { isLoading: isConfirming, isSuccess: isConfirmed, isError: isReceiptError, error: receiptError } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: !!txHash,
    }
  })

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
          upgraded: log.args.upgraded,
          blockNumber: log.blockNumber?.toString(),
          transactionHash: log.transactionHash,
          player: log.args.player
        })
        refetchInventory()
        refetchBoosts()
        refetchGlobalKills()
      }
    }
  })

  // Track transaction status
  useEffect(() => {
    // Check for errors first
    if (writeError || isReceiptError) {
      setTxStatus('failed')
      return
    }

    if (isWriting && !txHash) {
      setTxStatus('preparing')
    } else if (isWriting && txHash) {
      setTxStatus('pending')
    } else if (txHash && !isConfirming && !isConfirmed && !isReceiptError) {
      setTxStatus('submitted')
    } else if (txHash && isConfirming) {
      setTxStatus('confirming')
    } else if (txHash && isConfirmed) {
      setTxStatus('confirmed')
      // After confirmation, wait a bit for events
      setTimeout(() => {
        setTxStatus('waiting-event')
      }, 500)
    } else if (!isWriting && !txHash && !writeError) {
      setTxStatus(null)
    }
  }, [isWriting, txHash, isConfirming, isConfirmed, writeError, isReceiptError])

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
    if (!rakeFeeWei) return
    setTxStatus('preparing')
    writeContract({
      address: GAME_CONTRACT_ADDRESS,
      abi: GAME_CONTRACT_ABI,
      functionName: 'killBoss',
      value: rakeFeeWei,
    })
  }, [writeContract, rakeFeeWei])

  // Parse inventory
  const inventoryItems = inventory ? inventory.map(item => ({
    tier: Number(item.tier),
    id: item.id.toString()
  })) : []

  // Parse boosts
  const rarityBoost = boosts ? Number(boosts[0]) / 100 : 0 // Convert bps to percentage
  const rakeFeeMon = rakeFeeWei ? formatEther(rakeFeeWei) : '0'

  const handleReset = useCallback(() => {
    setTxStatus(null)
    reset()
  }, [reset])

  return {
    inventory: inventoryItems,
    rarityBoost,
    rakeFeeMon,
    globalBossesKilled: globalKills ? Number(globalKills) : 0,
    killBoss,
    isKilling: (isWriting || isConfirming || !!txStatus) && txStatus !== 'failed',
    txStatus,
    txHash,
    isConfirming,
    isConfirmed,
    txError: writeError || receiptError,
    lastEvent,
    clearLastEvent: () => setLastEvent(null),
    resetTransaction: handleReset,
    refetchInventory,
  }
}

