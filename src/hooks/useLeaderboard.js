import { useState, useEffect, useRef, useCallback } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { GAME_CONTRACT_ADDRESS, GAME_CONTRACT_ABI } from '../config/gameContract'

// Maximum players to fetch for leaderboard
const MAX_LEADERBOARD_PLAYERS = 100

export function useLeaderboard() {
  const { primaryWallet } = useDynamicContext()
  const [leaderboardData, setLeaderboardData] = useState([])
  const [loading, setLoading] = useState(true)
  const publicClientRef = useRef(null)
  const initializedRef = useRef(false)

  // Initialize public client when wallet is available
  useEffect(() => {
    if (primaryWallet && isEthereumWallet(primaryWallet)) {
      const initClient = async () => {
        try {
          const publicClient = await primaryWallet.getPublicClient()
          publicClientRef.current = publicClient
          initializedRef.current = true
        } catch (error) {
          console.error('Failed to initialize public client:', error)
        }
      }
      initClient()
    } else {
      publicClientRef.current = null
      initializedRef.current = false
    }
  }, [primaryWallet])

  const fetchLeaderboard = useCallback(async () => {
    if (!publicClientRef.current) {
      setLoading(false)
      return
    }

    const client = publicClientRef.current

    try {
      setLoading(true)
      console.log('[Leaderboard] Fetching with multicall...')

      // Step 1: Get player count (single call)
      const playerCount = await client.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'getPlayerCount',
      })
      
      const count = Number(playerCount || 0)
      console.log('[Leaderboard] Player count:', count)
      
      if (!count || count === 0) {
        setLeaderboardData([])
        setLoading(false)
        return
      }

      const playersToFetch = Math.min(count, MAX_LEADERBOARD_PLAYERS)

      // Step 2: Batch fetch all player addresses using multicall (1 RPC call instead of N)
      const addressCalls = Array.from({ length: playersToFetch }, (_, i) => ({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'getPlayerAt',
        args: [BigInt(i)]
      }))

      console.log('[Leaderboard] Fetching', playersToFetch, 'addresses via multicall...')
      const addressResults = await client.multicall({
        contracts: addressCalls,
        allowFailure: true
      })

      // Extract successful addresses
      const playerAddresses = addressResults
        .map(result => result.status === 'success' ? result.result : null)
        .filter(addr => addr !== null)

      console.log('[Leaderboard] Got', playerAddresses.length, 'addresses')

      if (playerAddresses.length === 0) {
        setLeaderboardData([])
        setLoading(false)
        return
      }

      // Step 3: Batch fetch all player stats AND inventories using multicall (1 RPC call instead of 2N)
      const dataCalls = playerAddresses.flatMap(addr => [
        {
          address: GAME_CONTRACT_ADDRESS,
          abi: GAME_CONTRACT_ABI,
          functionName: 'getPlayerStats',
          args: [addr]
        },
        {
          address: GAME_CONTRACT_ADDRESS,
          abi: GAME_CONTRACT_ABI,
          functionName: 'getInventory',
          args: [addr]
        }
      ])

      console.log('[Leaderboard] Fetching stats & inventories via multicall...')
      const dataResults = await client.multicall({
        contracts: dataCalls,
        allowFailure: true
      })

      // Process results - every 2 results correspond to 1 player (stats, inventory)
      const players = []
      for (let i = 0; i < playerAddresses.length; i++) {
        const statsResult = dataResults[i * 2]
        const inventoryResult = dataResults[i * 2 + 1]

        if (statsResult.status !== 'success') {
          console.warn(`[Leaderboard] Failed to get stats for player ${i}`)
          continue
        }

        const stats = statsResult.result
        const inventory = inventoryResult.status === 'success' ? inventoryResult.result : []

        // Calculate highest tier from inventory
        let highestTier = -1
        if (inventory && inventory.length > 0) {
          highestTier = Math.max(...inventory.map(item => Number(item.tier)))
        }

        players.push({
          address: playerAddresses[i],
          rarityBoost: Number(stats[0]) / 100, // Convert bps to percentage
          successBoost: Number(stats[1]) / 100,
          bossKills: Number(stats[2]),
          inventorySize: Number(stats[3]),
          highestTier: highestTier
        })
      }

      console.log('[Leaderboard] ✅ Loaded', players.length, 'players with just 3 RPC calls!')
      setLeaderboardData(players)
    } catch (error) {
      console.error('[Leaderboard] Error fetching leaderboard:', error)
      
      // Fallback: try without multicall if it fails (some chains don't support it)
      console.log('[Leaderboard] Attempting fallback fetch...')
      await fetchLeaderboardFallback()
    } finally {
      setLoading(false)
    }
  }, [])

  // Fallback for chains that don't support multicall
  const fetchLeaderboardFallback = async () => {
    const client = publicClientRef.current
    if (!client) return

    try {
      const playerCount = await client.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'getPlayerCount',
      })
      
      const count = Math.min(Number(playerCount || 0), 50) // Limit to 50 in fallback mode
      
      if (count === 0) {
        setLeaderboardData([])
        return
      }

      // Parallel fetch with Promise.all (still faster than sequential)
      const indices = Array.from({ length: count }, (_, i) => i)
      
      const playerPromises = indices.map(async (i) => {
        try {
          const address = await client.readContract({
            address: GAME_CONTRACT_ADDRESS,
            abi: GAME_CONTRACT_ABI,
            functionName: 'getPlayerAt',
            args: [BigInt(i)]
          })

          const [stats, inventory] = await Promise.all([
            client.readContract({
              address: GAME_CONTRACT_ADDRESS,
              abi: GAME_CONTRACT_ABI,
              functionName: 'getPlayerStats',
              args: [address]
            }),
            client.readContract({
              address: GAME_CONTRACT_ADDRESS,
              abi: GAME_CONTRACT_ABI,
              functionName: 'getInventory',
              args: [address]
            })
          ])

          let highestTier = -1
          if (inventory && inventory.length > 0) {
            highestTier = Math.max(...inventory.map(item => Number(item.tier)))
          }

          return {
            address,
            rarityBoost: Number(stats[0]) / 100,
            successBoost: Number(stats[1]) / 100,
            bossKills: Number(stats[2]),
            inventorySize: Number(stats[3]),
            highestTier
          }
        } catch (err) {
          console.error(`[Leaderboard] Fallback error for player ${i}:`, err)
          return null
        }
      })

      const results = await Promise.all(playerPromises)
      const players = results.filter(p => p !== null)
      
      console.log('[Leaderboard] ✅ Fallback loaded', players.length, 'players')
      setLeaderboardData(players)
    } catch (error) {
      console.error('[Leaderboard] Fallback fetch failed:', error)
    }
  }

  // Initial fetch when client is ready
  useEffect(() => {
    if (publicClientRef.current && initializedRef.current) {
      fetchLeaderboard()
    }
  }, [primaryWallet?.address, fetchLeaderboard])

  const refetchLeaderboard = useCallback(async () => {
    await fetchLeaderboard()
  }, [fetchLeaderboard])

  return {
    leaderboardData,
    loading,
    refetchLeaderboard
  }
}
