import { useState, useEffect } from 'react'
import { useReadContract, usePublicClient } from 'wagmi'
import { GAME_CONTRACT_ADDRESS, GAME_CONTRACT_ABI } from '../config/gameContract'

export function useLeaderboard() {
  const [leaderboardData, setLeaderboardData] = useState([])
  const [loading, setLoading] = useState(true)
  const publicClient = usePublicClient()

  // Read player count
  const { data: playerCount, refetch: refetchCount } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    functionName: 'getPlayerCount',
  })

  useEffect(() => {
    async function fetchLeaderboard() {
      if (!playerCount || !publicClient) {
        setLoading(false)
        return
      }
      
      setLoading(true)
      const count = Number(playerCount)
      
      if (count === 0) {
        setLeaderboardData([])
        setLoading(false)
        return
      }

      try {
        const players = []

        // Fetch up to 100 players
        for (let i = 0; i < Math.min(count, 100); i++) {
          try {
            // Get player address
            const address = await publicClient.readContract({
              address: GAME_CONTRACT_ADDRESS,
              abi: GAME_CONTRACT_ABI,
              functionName: 'getPlayerAt',
              args: [BigInt(i)]
            })

            // Get player stats
            const stats = await publicClient.readContract({
              address: GAME_CONTRACT_ADDRESS,
              abi: GAME_CONTRACT_ABI,
              functionName: 'getPlayerStats',
              args: [address]
            })

            players.push({
              address: address,
              rarityBoost: Number(stats[0]) / 100, // Convert bps to percentage
              successBoost: Number(stats[1]) / 100,
              bossKills: Number(stats[2]),
              inventorySize: Number(stats[3])
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

    fetchLeaderboard()
  }, [playerCount, publicClient])

  return {
    leaderboardData,
    loading,
    refetchLeaderboard: refetchCount
  }
}

