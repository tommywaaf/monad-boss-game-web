import { useReadContract, useWriteContract, useWatchContractEvent } from 'wagmi'
import { useAccount } from 'wagmi'
import { GAME_CONTRACT_ABI, GAME_CONTRACT_ADDRESS } from '../config/gameContract'
import { useState, useEffect, useCallback } from 'react'
import { formatEther } from 'viem'

export function useGameContract() {
  const { address } = useAccount()
  const { writeContract, isPending: isWriting } = useWriteContract()
  const [lastEvent, setLastEvent] = useState(null)

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
          upgraded: log.args.upgraded
        })
        refetchInventory()
        refetchBoosts()
        refetchGlobalKills()
      }
    }
  })

  const killBoss = useCallback(() => {
    if (!rakeFeeWei) return
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

  return {
    inventory: inventoryItems,
    rarityBoost,
    rakeFeeMon,
    globalBossesKilled: globalKills ? Number(globalKills) : 0,
    killBoss,
    isKilling: isWriting,
    lastEvent,
    clearLastEvent: () => setLastEvent(null),
    refetchInventory,
  }
}

