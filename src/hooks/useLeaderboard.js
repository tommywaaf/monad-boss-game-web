import { useState, useEffect, useRef, useCallback } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { createPublicClient, http, defineChain } from 'viem'
import { GAME_CONTRACT_ADDRESS, GAME_CONTRACT_ABI } from '../config/gameContract'

// Maximum players to fetch for leaderboard
const MAX_LEADERBOARD_PLAYERS = 100

export function useLeaderboard() {
  const { primaryWallet } = useDynamicContext()
  const [leaderboardData, setLeaderboardData] = useState([])
  const [loading, setLoading] = useState(true)
  const [isClientReady, setIsClientReady] = useState(false)
  const publicClientRef = useRef(null)
  const lastFetchRef = useRef(0)
  const FETCH_COOLDOWN = 5000 // 5 seconds cooldown between fetches

  // Initialize public client - get from wallet (same pattern as useGameContract)
  // Dynamic's wallet.getPublicClient() returns the same instance, so this shares the RPC connection
  useEffect(() => {
    const initClient = async () => {
      try {
        // IMPORTANT: Always use a separate direct RPC client for leaderboard reads
        // This prevents leaderboard reads from interfering with write operations (Attack Boss, Withdraw)
        // Using the same connection for reads and writes can cause RPC endpoint issues
        console.log('[Leaderboard] Creating dedicated RPC client for read-only leaderboard access')
        const monadChain = defineChain({
          id: 143,
          name: 'Monad',
          network: 'monad',
          nativeCurrency: {
            decimals: 18,
            name: 'Monad',
            symbol: 'MON',
          },
          rpcUrls: {
            default: {
              http: ['https://rpc.monad.xyz/'],
            },
            public: {
              http: ['https://rpc.monad.xyz/'],
            },
          },
          blockExplorers: {
            default: {
              name: 'Monad Explorer',
              url: 'https://monad.socialscan.io',
            },
          },
          testnet: false,
        })
        
        const publicClient = createPublicClient({
          chain: monadChain,
          transport: http('https://rpc.monad.xyz/')
        })
        publicClientRef.current = publicClient
        setIsClientReady(true)
        console.log('[Leaderboard] Using direct RPC public client (read-only, no wallet)')
      } catch (error) {
        console.error('[Leaderboard] Failed to initialize public client:', error)
        publicClientRef.current = null
        setIsClientReady(false)
      }
    }
    
    initClient()
  }, [primaryWallet?.address]) // Only depend on address, not the whole wallet object (same as useGameContract)

  // Fallback for chains that don't support multicall
  // VERY conservative: only fetch top 10 players to avoid rate limiting
  const fetchLeaderboardFallback = useCallback(async () => {
    const client = publicClientRef.current
    if (!client) {
      console.warn('[Leaderboard] Fallback: No public client available')
      return
    }

    if (!GAME_CONTRACT_ADDRESS || GAME_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      console.error('[Leaderboard] Fallback: Contract address not set!')
      return
    }

    try {
      setLoading(true)
      const playerCount = await client.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'getPlayerCount',
      })
      
      // VERY conservative: only fetch top 10 in fallback mode to avoid rate limiting
      const count = Math.min(Number(playerCount || 0), 10)
      
      if (count === 0) {
        setLeaderboardData([])
        setLoading(false)
        return
      }

      // Sequential fetch with delays to avoid rate limiting
      // This is slower but much safer for RPC endpoints
      const players = []
      for (let i = 0; i < count; i++) {
        try {
          // Add small delay between requests to avoid rate limiting
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 100)) // 100ms delay
          }
          
          const address = await client.readContract({
            address: GAME_CONTRACT_ADDRESS,
            abi: GAME_CONTRACT_ABI,
            functionName: 'getPlayerAt',
            args: [BigInt(i)]
          })

          // Small delay before next batch
          await new Promise(resolve => setTimeout(resolve, 50))
          
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

          players.push({
            address,
            rarityBoost: Number(stats[0]) / 100,
            successBoost: Number(stats[1]) / 100,
            bossKills: Number(stats[2]),
            inventorySize: Number(stats[3]),
            highestTier
          })
        } catch (err) {
          console.error(`[Leaderboard] Fallback error for player ${i}:`, err)
          // Continue to next player instead of stopping
        }
      }
      
      console.log('[Leaderboard] ✅ Fallback loaded', players.length, 'players')
      setLeaderboardData(players)
      setLoading(false)
    } catch (error) {
      console.error('[Leaderboard] Fallback fetch failed:', error)
      setLeaderboardData([])
      setLoading(false)
      throw error // Re-throw so the caller knows it failed
    }
  }, [])

  const fetchLeaderboard = useCallback(async () => {
    if (!publicClientRef.current) {
      console.warn('[Leaderboard] Public client not available')
      setLoading(false)
      return
    }

    // Rate limiting: Don't fetch if we just fetched recently
    const now = Date.now()
    const timeSinceLastFetch = now - lastFetchRef.current
    if (timeSinceLastFetch < FETCH_COOLDOWN) {
      const remaining = Math.ceil((FETCH_COOLDOWN - timeSinceLastFetch) / 1000)
      console.log(`[Leaderboard] Cooldown active, please wait ${remaining}s before fetching again`)
      return
    }

    // Don't fetch if RPC is having issues (check for recent errors)
    // This prevents hammering a failing RPC endpoint
    if (publicClientRef.current && typeof publicClientRef.current.getBlockNumber === 'function') {
      try {
        // Quick health check - if this fails, RPC is having issues
        await Promise.race([
          publicClientRef.current.getBlockNumber(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), 2000))
        ])
      } catch (error) {
        console.warn('[Leaderboard] RPC health check failed, skipping fetch to avoid further issues:', error.message)
        setLoading(false)
        return
      }
    }

    // Validate contract address
    if (!GAME_CONTRACT_ADDRESS || GAME_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      console.error('[Leaderboard] Contract address not set! Please set VITE_CONTRACT_ADDRESS in .env')
      setLeaderboardData([])
      setLoading(false)
      return
    }

    const client = publicClientRef.current

    try {
      setLoading(true)
      lastFetchRef.current = now
      console.log('[Leaderboard] Fetching with multicall...', { contractAddress: GAME_CONTRACT_ADDRESS })

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
      setLoading(false)
    } catch (error) {
      console.error('[Leaderboard] Error fetching leaderboard:', error)
      console.error('[Leaderboard] Error details:', {
        message: error.message,
        cause: error.cause,
        stack: error.stack
      })
      
      // Don't use fallback if it's a rate limit error - that would make it worse
      if (error.message?.includes('too many errors') || error.message?.includes('rate limit')) {
        console.warn('[Leaderboard] Rate limit detected, skipping fallback to avoid further issues')
        setLeaderboardData([])
        setLoading(false)
        return
      }
      
      // Fallback: try without multicall if it fails (some chains don't support it)
      // But limit to top 10 players to avoid rate limiting
      console.log('[Leaderboard] Attempting conservative fallback fetch (top 10 only)...')
      try {
        await fetchLeaderboardFallback()
      } catch (fallbackError) {
        console.error('[Leaderboard] Fallback also failed:', fallbackError)
        setLeaderboardData([])
      } finally {
        setLoading(false)
      }
    }
  }, [fetchLeaderboardFallback])

  // DISABLED AUTO-FETCH: Leaderboard no longer fetches automatically on mount
  // This prevents rate limiting the RPC endpoint which breaks Attack Boss and Withdraw
  // User must click the refresh button to load the leaderboard
  useEffect(() => {
    if (isClientReady) {
      // Just mark loading as false - don't auto-fetch
      console.log('[Leaderboard] Client ready, auto-fetch DISABLED to prevent rate limiting')
      console.log('[Leaderboard] Click the refresh button to load the leaderboard')
      setLoading(false)
    } else {
      // Set a timeout to stop loading if client never initializes
      const timeout = setTimeout(() => {
        if (!isClientReady) {
          console.warn('[Leaderboard] Client initialization timeout after 10s, stopping load')
          setLoading(false)
        }
      }, 10000)
      return () => clearTimeout(timeout)
    }
  }, [isClientReady])

  const refetchLeaderboard = useCallback(async () => {
    await fetchLeaderboard()
  }, [fetchLeaderboard])

  return {
    leaderboardData,
    loading,
    refetchLeaderboard
  }
}
