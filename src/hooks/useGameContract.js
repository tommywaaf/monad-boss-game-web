import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { GAME_CONTRACT_ABI, GAME_CONTRACT_ADDRESS } from '../config/gameContract'
import { useState, useEffect, useCallback, useRef } from 'react'

// Helper functions to avoid viem bundling issues
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

export function useGameContract() {
  const { primaryWallet } = useDynamicContext()
  const [inventory, setInventory] = useState([])
  const [rarityBoost, setRarityBoost] = useState(0)
  const [rakeFeeMon, setRakeFeeMon] = useState('Loading...')
  const [globalBossesKilled, setGlobalBossesKilled] = useState(0)
  const [lastEvent, setLastEvent] = useState(null)
  const [txStatus, setTxStatus] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [txError, setTxError] = useState(null)
  const [isWriting, setIsWriting] = useState(false)
  const publicClientRef = useRef(null)
  const walletClientRef = useRef(null)

  // Initialize clients when wallet is available
  useEffect(() => {
    if (primaryWallet && isEthereumWallet(primaryWallet)) {
      const initClients = async () => {
        try {
          console.log('[useGameContract] Initializing wallet clients...')
          const publicClient = await primaryWallet.getPublicClient()
          const walletClient = await primaryWallet.getWalletClient()
          
          if (!publicClient || !walletClient) {
            console.error('[useGameContract] Failed to get clients:', { publicClient: !!publicClient, walletClient: !!walletClient })
            return
          }
          
          publicClientRef.current = publicClient
          walletClientRef.current = walletClient
          console.log('[useGameContract] Wallet clients initialized successfully')
          
          // Fetch contract data immediately after clients are ready
          if (primaryWallet.address) {
            console.log('[useGameContract] Fetching contract data after client init...')
            fetchContractData()
          }
        } catch (error) {
          console.error('[useGameContract] Failed to initialize clients:', error)
          publicClientRef.current = null
          walletClientRef.current = null
        }
      }
      initClients()
    } else {
      publicClientRef.current = null
      walletClientRef.current = null
    }
  }, [primaryWallet, fetchContractData])

  // Read contract data
  const fetchContractData = useCallback(async () => {
    if (!publicClientRef.current) {
      console.log('[fetchContractData] Public client not ready yet')
      return
    }
    
    if (!primaryWallet?.address) {
      console.log('[fetchContractData] No wallet address')
      return
    }

    if (GAME_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      console.error('[fetchContractData] Contract address not set!')
      return
    }

    try {
      console.log('[fetchContractData] Fetching contract data...')
      console.log('[fetchContractData] Contract address:', GAME_CONTRACT_ADDRESS)
      console.log('[fetchContractData] Wallet address:', primaryWallet.address)
      
      // Read rake fee first (most important for button state)
      console.log('[fetchContractData] Reading RAKE_FEE...')
      const rakeFeeWei = await publicClientRef.current.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'RAKE_FEE',
      })
      const feeMon = formatEther(rakeFeeWei)
      console.log('[fetchContractData] Rake fee loaded:', feeMon, 'MON')
      setRakeFeeMon(feeMon)

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
      setRarityBoost(Number(boostsData[0]) / 100) // Convert bps to percentage

      // Read global kills
      const globalKills = await publicClientRef.current.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'totalBossesKilled',
      })
      setGlobalBossesKilled(Number(globalKills))
      
      console.log('[fetchContractData] Contract data loaded successfully')
    } catch (error) {
      console.error('[fetchContractData] Error fetching contract data:', error)
      console.error('[fetchContractData] Error details:', {
        message: error.message,
        contractAddress: GAME_CONTRACT_ADDRESS,
        hasPublicClient: !!publicClientRef.current,
        hasAddress: !!primaryWallet?.address
      })
    }
  }, [primaryWallet?.address])

  // Fetch data on mount and when address changes (with retry logic)
  useEffect(() => {
    if (!primaryWallet?.address) {
      console.log('[useGameContract] No wallet address, skipping fetch')
      return
    }
    
    if (!publicClientRef.current) {
      console.log('[useGameContract] Public client not ready, will retry after init')
      // Retry after a short delay if client isn't ready
      const retryTimer = setTimeout(() => {
        if (publicClientRef.current && primaryWallet?.address) {
          console.log('[useGameContract] Retrying fetch after client init')
          fetchContractData()
        }
      }, 1000)
      return () => clearTimeout(retryTimer)
    }

    // Client is ready, fetch data
    console.log('[useGameContract] Fetching contract data (address changed)')
    fetchContractData()
    
    // Set up polling for contract data
    const interval = setInterval(() => {
      if (publicClientRef.current && primaryWallet?.address) {
        fetchContractData()
      }
    }, 10000) // Poll every 10 seconds
    
    return () => clearInterval(interval)
  }, [primaryWallet?.address, fetchContractData])

  // Watch for BossKilled events
  useEffect(() => {
    if (!publicClientRef.current || !primaryWallet?.address) return

    let unwatch = null

    const setupEventWatcher = async () => {
      try {
        unwatch = await publicClientRef.current.watchContractEvent({
          address: GAME_CONTRACT_ADDRESS,
          abi: GAME_CONTRACT_ABI,
          eventName: 'BossKilled',
          onLogs: (logs) => {
            const log = logs[0]
            if (log && log.args.player?.toLowerCase() === primaryWallet.address?.toLowerCase()) {
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
              fetchContractData() // Refresh inventory and boosts
            }
          }
        })
      } catch (error) {
        console.error('Error setting up event watcher:', error)
      }
    }

    setupEventWatcher()

    return () => {
      if (unwatch) {
        unwatch()
      }
    }
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
      setTimeout(() => {
        setTxStatus('waiting-event')
      }, 500)
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
    // Check if wallet is connected
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      console.error('[killBoss] No wallet connected')
      setTxError(new Error('Please connect your wallet first'))
      setTxStatus('failed')
      return
    }

    // Check if fee is ready
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

      // Ensure clients are initialized (refresh if needed)
      let walletClient = walletClientRef.current
      let publicClient = publicClientRef.current

      if (!walletClient || !publicClient) {
        console.log('[killBoss] Clients not ready, initializing...')
        walletClient = await primaryWallet.getWalletClient()
        publicClient = await primaryWallet.getPublicClient()
        
        if (!walletClient || !publicClient) {
          throw new Error('Failed to initialize wallet clients. Please try again.')
        }
        
        walletClientRef.current = walletClient
        publicClientRef.current = publicClient
      }

      console.log('[killBoss] Writing contract transaction...')
      console.log('[killBoss] Contract:', GAME_CONTRACT_ADDRESS)
      console.log('[killBoss] Function: killBoss')
      console.log('[killBoss] Value:', parseEther(rakeFeeMon).toString(), 'wei')

      // Write contract - this should trigger Dynamic's signature modal
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
      console.log('[killBoss] Waiting for transaction receipt...')
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      console.log('[killBoss] Transaction receipt:', receipt)
      
      setIsConfirming(false)
      setIsConfirmed(true)
      setTxStatus('confirmed')

      // Wait a bit for events
      setTimeout(() => {
        setTxStatus('waiting-event')
      }, 500)
    } catch (error) {
      console.error('[killBoss] Error:', error)
      setTxError(error)
      setTxStatus('failed')
      setIsWriting(false)
      setIsConfirming(false)
      setIsConfirmed(false)
    }
  }, [primaryWallet, rakeFeeMon])

  const handleReset = useCallback(() => {
    setTxStatus(null)
    setTxHash(null)
    setIsWriting(false)
    setIsConfirming(false)
    setIsConfirmed(false)
    setTxError(null)
  }, [])

  return {
    inventory,
    rarityBoost,
    rakeFeeMon,
    globalBossesKilled,
    killBoss,
    isKilling: (isWriting || isConfirming || !!txStatus) && txStatus !== 'failed',
    txStatus,
    txHash,
    isConfirming,
    isConfirmed,
    txError,
    lastEvent,
    clearLastEvent: () => setLastEvent(null),
    resetTransaction: handleReset,
    refetchInventory: fetchContractData,
  }
}
