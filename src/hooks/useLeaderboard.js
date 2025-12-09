import { useState, useEffect, useRef, useCallback } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { createPublicClient, http, defineChain } from 'viem'
import { GAME_CONTRACT_ADDRESS, GAME_CONTRACT_ABI } from '../config/gameContract'
import { useGameContract } from './useGameContract'

// Maximum players to fetch for leaderboard
const MAX_LEADERBOARD_PLAYERS = 100

export function useLeaderboard() {
  const { primaryWallet } = useDynamicContext()
  // Try to use the shared public client from useGameContract first (ensures same RPC instance)
  let sharedPublicClient = null
  try {
    const gameContract = useGameContract()
    sharedPublicClient = gameContract?.publicClient || null
  } catch (error) {
    // useGameContract might not be available (e.g., outside provider), that's okay
    sharedPublicClient = null
  }
  
  const [leaderboardData, setLeaderboardData] = useState([])
  const [loading, setLoading] = useState(true)
  const [isClientReady, setIsClientReady] = useState(false)
  const publicClientRef = useRef(null)

  // Initialize public client - prefer shared client from useGameContract, fallback to wallet or direct RPC
  useEffect(() => {
    const initClient = async () => {
      try {
        // First priority: Use shared public client from useGameContract (same instance as Attack Boss & Withdraw)
        if (sharedPublicClient) {
          publicClientRef.current = sharedPublicClient
          setIsClientReady(true)
          console.log('[Leaderboard] Using shared public client from useGameContract (same as Attack Boss & Withdraw)')
          return
        }
        
        // Second priority: Get public client from wallet (same pattern as useGameContract)
        if (primaryWallet && isEthereumWallet(primaryWallet)) {
          try {
            const publicClient = await primaryWallet.getPublicClient()
            if (publicClient) {
              publicClientRef.current = publicClient
              setIsClientReady(true)
              console.log('[Leaderboard] Using wallet public client')
              return
            }
          } catch (error) {
            console.warn('[Leaderboard] Failed to get wallet public client:', error)
          }
        }
        
        // Last resort: Create direct RPC client if no wallet is connected
        // This allows leaderboard to work even without wallet connection
        console.log('[Leaderboard] No wallet connected, creating direct RPC client for read-only access')
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
  }, [primaryWallet?.address, sharedPublicClient]) // Include sharedPublicClient in dependencies

  // Fallback for chains that don't support multicall
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
      
      const count = Math.min(Number(playerCount || 0), 50) // Limit to 50 in fallback mode
      
      if (count === 0) {
        setLeaderboardData([])
        setLoading(false)
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
      
      // Fallback: try without multicall if it fails (some chains don't support it)
      console.log('[Leaderboard] Attempting fallback fetch...')
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

  // Initial fetch when client is ready
  useEffect(() => {
    if (isClientReady && publicClientRef.current) {
      console.log('[Leaderboard] Client ready, fetching leaderboard...')
      fetchLeaderboard()
    } else {
      console.log('[Leaderboard] Waiting for client...', { isClientReady, hasClient: !!publicClientRef.current })
      // Set a timeout to stop loading if client never initializes (e.g., network issues)
      const timeout = setTimeout(() => {
        if (!isClientReady) {
          console.warn('[Leaderboard] Client initialization timeout after 10s, stopping load')
          setLoading(false)
        }
      }, 10000) // 10 second timeout
      return () => clearTimeout(timeout)
    }
  }, [isClientReady, fetchLeaderboard])

  const refetchLeaderboard = useCallback(async () => {
    await fetchLeaderboard()
  }, [fetchLeaderboard])

  return {
    leaderboardData,
    loading,
    refetchLeaderboard
  }
}
