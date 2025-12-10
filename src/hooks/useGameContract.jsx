import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { GAME_CONTRACT_ABI, GAME_CONTRACT_ADDRESS } from '../config/gameContract'
import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'

// Helper functions
const formatEther = (value) => {
  if (typeof value === 'bigint') {
    return (Number(value) / 1e18).toString()
  }
  return (Number(value) / 1e18).toString()
}

const parseEther = (value) => {
  const num = parseFloat(value)
  return BigInt(Math.floor(num * 1e18))
}

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
  const { primaryWallet, sdkHasLoaded } = useDynamicContext()
  const address = primaryWallet?.address
  
  const [inventory, setInventory] = useState([])
  const [rarityBoost, setRarityBoost] = useState(0)
  const [rakeFeeMon, setRakeFeeMon] = useState('0')
  const [globalBossesKilled, setGlobalBossesKilled] = useState(0)
  const [lastEvent, setLastEvent] = useState(null)
  const [txStatus, setTxStatus] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [txError, setTxError] = useState(null)
  const [isWriting, setIsWriting] = useState(false)
  const [inventoryVersion, setInventoryVersion] = useState(0)
  
  const publicClientRef = useRef(null)
  const walletClientRef = useRef(null)
  const initializedAddressRef = useRef(null)

  // Initialize clients when wallet is available AND SDK has loaded
  useEffect(() => {
    const currentAddress = primaryWallet?.address
    
    // Wait for SDK to be fully loaded before initializing clients
    if (!sdkHasLoaded) {
      console.log('[useGameContract] Waiting for SDK to load...')
      return
    }
    
    if (primaryWallet && isEthereumWallet(primaryWallet) && currentAddress !== initializedAddressRef.current) {
      const initClients = async () => {
        try {
          console.log('[useGameContract] SDK loaded, initializing wallet clients...')
          
          // Get public client first (this usually works)
          const publicClient = await primaryWallet.getPublicClient()
          publicClientRef.current = publicClient
          
          // For embedded wallets, wallet client initialization may need a delay
          // to ensure the Waas SDK is fully ready
          const isEmbedded = primaryWallet.connector?.isEmbedded
          if (isEmbedded) {
            console.log('[useGameContract] Embedded wallet detected, waiting for Waas SDK...')
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
          
          const walletClient = await primaryWallet.getWalletClient()
          
          if (!publicClient || !walletClient) {
            console.error('[useGameContract] Failed to get clients:', { publicClient: !!publicClient, walletClient: !!walletClient })
            return
          }
          
          walletClientRef.current = walletClient
          initializedAddressRef.current = currentAddress
          console.log('[useGameContract] Wallet clients initialized successfully')
        } catch (error) {
          console.error('[useGameContract] Failed to initialize clients:', error)
          // Don't null out publicClient if it was successful
          walletClientRef.current = null
          initializedAddressRef.current = null
        }
      }
      initClients()
    } else if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      publicClientRef.current = null
      walletClientRef.current = null
      initializedAddressRef.current = null
    }
  }, [primaryWallet?.address, sdkHasLoaded])

  // Fetch contract data
  const fetchContractData = useCallback(async () => {
    if (!publicClientRef.current || !primaryWallet?.address) {
      return
    }

    try {
      // Read rake fee
      const rakeFeeWei = await publicClientRef.current.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'RAKE_FEE',
      })
      setRakeFeeMon(formatEther(rakeFeeWei))

      // Read inventory
      const inventoryData = await publicClientRef.current.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'getInventory',
        args: [primaryWallet.address],
      })
      setInventory(inventoryData.map(item => ({
        tier: Number(item.tier),
        id: item.id.toString()
      })))

      // Read boosts
      const boostsData = await publicClientRef.current.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'getTotalBoosts',
        args: [primaryWallet.address],
      })
      setRarityBoost(Number(boostsData[0]) / 100)

      // Read global kills
      const globalKills = await publicClientRef.current.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'totalBossesKilled',
      })
      setGlobalBossesKilled(Number(globalKills))
    } catch (error) {
      console.error('[fetchContractData] Error:', error)
    }
  }, [primaryWallet?.address])

  // Fetch data when wallet changes
  useEffect(() => {
    if (!primaryWallet?.address || !publicClientRef.current) {
      const retryTimer = setTimeout(() => {
        if (publicClientRef.current && primaryWallet?.address) {
          fetchContractData()
        }
      }, 1000)
      return () => clearTimeout(retryTimer)
    }

    fetchContractData()
    const interval = setInterval(fetchContractData, 30000)
    return () => clearInterval(interval)
  }, [primaryWallet?.address, fetchContractData])

  // Track transaction status
  useEffect(() => {
    if (txError) {
      setTxStatus('failed')
      return
    }
    if (isWriting && !txHash) {
      setTxStatus('preparing')
    } else if (isWriting && txHash) {
      setTxStatus('pending')
    } else if (txHash && !isConfirming && !isConfirmed && !txError) {
      setTxStatus('submitted')
    } else if (txHash && isConfirming) {
      setTxStatus('confirming')
    } else if (txHash && isConfirmed) {
      setTxStatus('confirmed')
      setTimeout(() => setTxStatus('waiting-event'), 500)
    } else if (!isWriting && !txHash && !txError) {
      setTxStatus(null)
    }
  }, [isWriting, txHash, isConfirming, isConfirmed, txError])

  // Reset status when event is received
  useEffect(() => {
    if (lastEvent && txStatus === 'waiting-event') {
      setTimeout(() => {
        setTxStatus(null)
        setTxHash(null)
        setIsWriting(false)
        setIsConfirming(false)
        setIsConfirmed(false)
        setTxError(null)
      }, 1000)
    }
  }, [lastEvent, txStatus])

  const killBoss = useCallback(async () => {
    if (!sdkHasLoaded) {
      console.error('[killBoss] SDK not loaded yet')
      setTxError(new Error('Please wait for wallet to initialize...'))
      setTxStatus('failed')
      return
    }

    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      console.error('[killBoss] No wallet connected')
      setTxError(new Error('Please connect your wallet first'))
      setTxStatus('failed')
      return
    }

    if (!rakeFeeMon || rakeFeeMon === '0') {
      console.error('[killBoss] Rake fee not loaded')
      setTxError(new Error('Fee not loaded. Please wait...'))
      setTxStatus('failed')
      return
    }

    try {
      setTxStatus('preparing')
      setIsWriting(true)
      setTxError(null)
      setLastEvent(null)

      // Ensure clients are initialized - with retry for embedded wallets
      let walletClient = walletClientRef.current
      let publicClient = publicClientRef.current

      if (!walletClient || !publicClient) {
        console.log('[killBoss] Clients not ready, initializing...')
        
        // For embedded wallets, add a small delay to ensure Waas SDK is ready
        const isEmbedded = primaryWallet.connector?.isEmbedded
        if (isEmbedded) {
          console.log('[killBoss] Embedded wallet - waiting for Waas SDK...')
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        
        publicClient = await primaryWallet.getPublicClient()
        walletClient = await primaryWallet.getWalletClient()
        
        if (!walletClient || !publicClient) {
          throw new Error('Failed to initialize wallet clients. Please try again.')
        }
        
        walletClientRef.current = walletClient
        publicClientRef.current = publicClient
      }

      console.log('[killBoss] Writing contract transaction...')
      console.log('[killBoss] Contract:', GAME_CONTRACT_ADDRESS)
      console.log('[killBoss] Value:', parseEther(rakeFeeMon).toString(), 'wei')

      // Write contract - this triggers Dynamic's signature modal
      const hash = await walletClient.writeContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'killBoss',
        value: parseEther(rakeFeeMon),
        account: primaryWallet.address,
      })

      console.log('[killBoss] Transaction hash:', hash)
      setTxHash(hash)
      setTxStatus('submitted')
      setIsWriting(false)
      setIsConfirming(true)

      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      console.log('[killBoss] Transaction receipt:', receipt)
      
      setIsConfirming(false)
      setIsConfirmed(true)
      setTxStatus('confirmed')

      // Process BossKilled event from receipt
      if (receipt.logs) {
        for (const log of receipt.logs) {
          if (log.address?.toLowerCase() === GAME_CONTRACT_ADDRESS.toLowerCase()) {
            try {
              // Try to decode the event
              const { decodeEventLog } = await import('viem')
              const decoded = decodeEventLog({
                abi: GAME_CONTRACT_ABI,
                data: log.data,
                topics: log.topics,
              })
              
              if (decoded.eventName === 'BossKilled' && 
                  decoded.args.player?.toLowerCase() === primaryWallet.address?.toLowerCase()) {
                setLastEvent({
                  type: 'success',
                  tier: Number(decoded.args.tier),
                  itemId: decoded.args.itemId?.toString(),
                  baseRoll: decoded.args.baseRoll?.toString(),
                  baseTier: Number(decoded.args.baseTier),
                  upgraded: decoded.args.upgraded,
                  transactionHash: hash,
                })
                break
              }
            } catch (e) {
              // Not the event we're looking for
            }
          }
        }
      }

      // Refresh data
      setTimeout(() => {
        fetchContractData()
        setInventoryVersion(v => v + 1)
      }, 500)

    } catch (error) {
      console.error('[killBoss] Error:', error)
      setTxError(error)
      setTxStatus('failed')
      setIsWriting(false)
      setIsConfirming(false)
      setIsConfirmed(false)
    }
  }, [primaryWallet, rakeFeeMon, fetchContractData, sdkHasLoaded])

  const resetTransaction = useCallback(() => {
    setTxStatus(null)
    setTxHash(null)
    setIsWriting(false)
    setIsConfirming(false)
    setIsConfirmed(false)
    setTxError(null)
    setLastEvent(null)
  }, [])

  // Getter for wallet client - for use by other components
  const getWalletClient = useCallback(async () => {
    if (walletClientRef.current) {
      return walletClientRef.current
    }
    
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      throw new Error('Wallet not connected')
    }
    
    // For embedded wallets, add a small delay
    const isEmbedded = primaryWallet.connector?.isEmbedded
    if (isEmbedded) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    const client = await primaryWallet.getWalletClient()
    walletClientRef.current = client
    return client
  }, [primaryWallet])

  // Getter for public client
  const getPublicClient = useCallback(async () => {
    if (publicClientRef.current) {
      return publicClientRef.current
    }
    
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      throw new Error('Wallet not connected')
    }
    
    const client = await primaryWallet.getPublicClient()
    publicClientRef.current = client
    return client
  }, [primaryWallet])

  const value = {
    inventory,
    refetchInventory: fetchContractData,
    inventoryVersion,
    rarityBoost,
    rakeFeeMon,
    globalBossesKilled,
    killBoss,
    isKilling: (isWriting || isConfirming || !!txStatus) && txStatus !== 'failed',
    txStatus,
    txHash,
    txError,
    isConfirming,
    isConfirmed,
    resetTransaction,
    lastEvent,
    clearLastEvent: () => setLastEvent(null),
    // Expose clients for other components
    getWalletClient,
    getPublicClient,
    primaryWallet,
  }

  return (
    <GameContractContext.Provider value={value}>
      {children}
    </GameContractContext.Provider>
  )
}
