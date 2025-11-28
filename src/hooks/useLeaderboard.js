import { useState, useEffect, useRef } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { GAME_CONTRACT_ADDRESS, GAME_CONTRACT_ABI } from '../config/gameContract'

export function useLeaderboard() {
  const { primaryWallet } = useDynamicContext()
  const [leaderboardData, setLeaderboardData] = useState([])
  const [loading, setLoading] = useState(true)
  const publicClientRef = useRef(null)

  // Initialize public client when wallet is available
  useEffect(() => {
    if (primaryWallet && isEthereumWallet(primaryWallet)) {
      const initClient = async () => {
        try {
          const publicClient = await primaryWallet.getPublicClient()
          publicClientRef.current = publicClient
        } catch (error) {
          console.error('Failed to initialize public client:', error)
        }
      }
      initClient()
    } else {
      publicClientRef.current = null
    }
  }, [primaryWallet])

  const fetchLeaderboard = async () => {
    if (!publicClientRef.current) {
      setLoading(false)
      return
    }

    try {
      // Get player count
      const playerCount = await publicClientRef.current.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'getPlayerCount',
      })
      
      const count = Number(playerCount || 0)
      
      if (!count || count === 0) {
        setLeaderboardData([])
        setLoading(false)
        return
      }
      
      setLoading(true)

      const players = []

      // Fetch up to 100 players
      for (let i = 0; i < Math.min(count, 100); i++) {
        try {
          // Get player address
          const address = await publicClientRef.current.readContract({
            address: GAME_CONTRACT_ADDRESS,
            abi: GAME_CONTRACT_ABI,
            functionName: 'getPlayerAt',
            args: [BigInt(i)]
          })

          // Get player stats
          const stats = await publicClientRef.current.readContract({
            address: GAME_CONTRACT_ADDRESS,
            abi: GAME_CONTRACT_ABI,
            functionName: 'getPlayerStats',
            args: [address]
          })

          // Get inventory to calculate highest tier found
          const inventory = await publicClientRef.current.readContract({
            address: GAME_CONTRACT_ADDRESS,
            abi: GAME_CONTRACT_ABI,
            functionName: 'getInventory',
            args: [address]
          })

          // Calculate highest tier from inventory
          let highestTier = -1
          if (inventory && inventory.length > 0) {
            highestTier = Math.max(...inventory.map(item => Number(item.tier)))
          }

          players.push({
            address: address,
            rarityBoost: Number(stats[0]) / 100, // Convert bps to percentage
            successBoost: Number(stats[1]) / 100,
            bossKills: Number(stats[2]),
            inventorySize: Number(stats[3]),
            highestTier: highestTier
          })
        } catch (error) {
          console.error(`Error fetching player ${i}:`, error)
        }
      }

      setLeaderboardData(players)
    } catch (error) {
      console.error('Error fetching leaderboard:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (publicClientRef.current) {
      fetchLeaderboard()
    }
  }, [publicClientRef.current])

  const refetchLeaderboard = async () => {
    await fetchLeaderboard()
  }

  return {
    leaderboardData,
    loading,
    refetchLeaderboard
  }
}
