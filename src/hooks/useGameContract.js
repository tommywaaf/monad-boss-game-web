import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { GAME_CONTRACT_ABI, GAME_CONTRACT_ADDRESS } from '../config/gameContract'
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  createElement
} from 'react'

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

const GameContractContext = createContext(null)

function useProvideGameContract() {
  const { primaryWallet } = useDynamicContext()
  const [inventory, setInventory] = useState([])
  const [inventoryVersion, setInventoryVersion] = useState(0) // Force re-render when inventory changes
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
  const initializedAddressRef = useRef(null)

  // Initialize clients when wallet is available
  useEffect(() => {
    const currentAddress = primaryWallet?.address
    
    // Only re-initialize if wallet changed or address changed
    if (primaryWallet && isEthereumWallet(primaryWallet) && currentAddress !== initializedAddressRef.current) {
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
          initializedAddressRef.current = currentAddress
          console.log('[useGameContract] Wallet clients initialized successfully')
        } catch (error) {
          console.error('[useGameContract] Failed to initialize clients:', error)
          publicClientRef.current = null
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
  }, [primaryWallet?.address]) // Only depend on address, not the whole wallet object

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
      // Create a new array with new object references to ensure React detects the change
      const newInventory = inventoryData.map(item => ({
        tier: Number(item.tier),
        id: item.id.toString()
      }))
      console.log('[fetchContractData] Inventory updated:', newInventory.length, 'items')
      console.log('[fetchContractData] New inventory items:', newInventory.map(i => `#${i.id}`).join(', '))
      
      // CRITICAL: Update inventory FIRST, then increment version
      // This ensures the inventory state is updated before version changes
      setInventory([...newInventory])
      console.log('[fetchContractData] setInventory() called with new array - React should re-render Inventory component')
      
      // Then increment version to force re-render
      setInventoryVersion(prev => {
        const newVersion = prev + 1
        console.log('[fetchContractData] Incrementing inventoryVersion:', prev, '->', newVersion)
        return newVersion
      })

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
    
    // Poll every 60 seconds (very conservative to avoid rate limits)
    const interval = setInterval(() => {
      if (publicClientRef.current && primaryWallet?.address) {
        fetchContractData()
      }
    }, 60000)
    
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryWallet?.address]) // Only depend on address, fetchContractData is stable

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
                adjustedRoll: log.args.adjustedRoll?.toString(),
                rarityBoost: Number(log.args.rarityBoost || 0),
                blockNumber: log.blockNumber?.toString(),
                transactionHash: log.transactionHash,
                player: log.args.player
              })
              // DON'T call fetchContractData here - it's already called in killBoss and BossFight
              // This prevents duplicate rapid calls
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

      // Check receipt logs for BossKilled event immediately
      console.log('[killBoss] Checking receipt logs for BossKilled event...')
      console.log('[killBoss] Receipt logs:', receipt.logs)
      
      let bossKilledEvent = null
      
      // Try to find and decode BossKilled event from receipt logs
      for (const log of receipt.logs) {
        // Check if log is from our contract
        if (log.address?.toLowerCase() !== GAME_CONTRACT_ADDRESS.toLowerCase()) {
          continue
        }
        
        try {
          // Decode the event log
          const decoded = publicClient.decodeEventLog({
            abi: GAME_CONTRACT_ABI,
            data: log.data,
            topics: log.topics,
          })
          
          console.log('[killBoss] Decoded log:', decoded)
          
          if (decoded.eventName === 'BossKilled') {
            // Verify it's for this player
            if (decoded.args.player?.toLowerCase() === primaryWallet.address?.toLowerCase()) {
              bossKilledEvent = decoded
              break
            }
          }
        } catch (error) {
          // Not a BossKilled event or can't decode, continue
          continue
        }
      }

      if (bossKilledEvent) {
        console.log('[killBoss] ✅ BossKilled event found in receipt:', bossKilledEvent)
        console.log('[killBoss] 📊 baseRoll:', bossKilledEvent.args.baseRoll?.toString(), 
                    'adjustedRoll:', bossKilledEvent.args.adjustedRoll?.toString(),
                    'tier:', bossKilledEvent.args.tier)
        
        // Also look for RandomnessDebug event
        let debugEvent = null
        console.log('[killBoss] 🔍 Looking for RandomnessDebug in', receipt.logs.length, 'logs')
        for (const log of receipt.logs) {
          try {
            // Try to decode as RandomnessDebug
            const decoded = publicClient.decodeEventLog({
              abi: GAME_CONTRACT_ABI,
              eventName: 'RandomnessDebug',
              topics: log.topics,
              data: log.data,
            })
            if (decoded) {
              debugEvent = decoded
              console.log('[killBoss] 🔍 RandomnessDebug event found:', {
                blockhash: decoded.args.blockhashValue,
                blockNumber: decoded.args.blockNumber?.toString(),
                timestamp: decoded.args.timestamp?.toString(),
                nonce: decoded.args.nonce?.toString(),
                rawHash: decoded.args.rawHash?.toString(),
                finalRoll: decoded.args.finalRoll?.toString()
              })
              break
            }
          } catch (err) {
            // Log first topic to help debug
            if (log.topics?.[0]) {
              console.log('[killBoss] 🔍 Log topic[0]:', log.topics[0].slice(0, 20) + '...')
            }
            continue
          }
        }
        if (!debugEvent) {
          console.log('[killBoss] ⚠️ RandomnessDebug event NOT found - contract may need redeployment')
        }
        
        setLastEvent({
          type: 'success',
          tier: Number(bossKilledEvent.args.tier),
          itemId: bossKilledEvent.args.itemId?.toString(),
          baseRoll: bossKilledEvent.args.baseRoll?.toString(),
          adjustedRoll: bossKilledEvent.args.adjustedRoll?.toString(),
          rarityBoost: Number(bossKilledEvent.args.rarityBoost || 0),
          blockNumber: receipt.blockNumber?.toString(),
          transactionHash: hash,
          player: bossKilledEvent.args.player,
          // Debug info from RandomnessDebug event
          debug: debugEvent ? {
            blockhash: debugEvent.args.blockhashValue,
            blockNum: debugEvent.args.blockNumber?.toString(),
            timestamp: debugEvent.args.timestamp?.toString(),
            nonce: debugEvent.args.nonce?.toString(),
            rawHash: debugEvent.args.rawHash?.toString(),
            finalRoll: debugEvent.args.finalRoll?.toString()
          } : null
        })
        
        // DON'T call fetchContractData here - BossFight will handle the refresh
        // This prevents duplicate rapid calls
        
        // Reset transaction status
        setTimeout(() => {
          setTxStatus(null)
          setTxHash(null)
          setIsWriting(false)
          setIsConfirming(false)
          setIsConfirmed(false)
          setTxError(null)
        }, 1000)
        
        return // Event found, we're done
      } else {
        console.log('[killBoss] BossKilled event not found in receipt logs, will wait for event watcher or poll')
      }

      // If event not in receipt, query for it directly using getLogs
      console.log('[killBoss] Querying for BossKilled event from transaction...')
      try {
        const bossKilledAbi = GAME_CONTRACT_ABI.find(item => item.name === 'BossKilled' && item.type === 'event')
        
        if (bossKilledAbi) {
          const events = await publicClient.getLogs({
            address: GAME_CONTRACT_ADDRESS,
            event: bossKilledAbi,
            args: {
              player: primaryWallet.address
            },
            fromBlock: receipt.blockNumber,
            toBlock: receipt.blockNumber,
          })
          
          const playerEvent = events.find(e => 
            e.transactionHash?.toLowerCase() === hash.toLowerCase()
          )
          
          if (playerEvent) {
            console.log('[killBoss] ✅ BossKilled event found via getLogs:', playerEvent)
            
            setLastEvent({
              type: 'success',
              tier: Number(playerEvent.args.tier),
              itemId: playerEvent.args.itemId?.toString(),
              baseRoll: playerEvent.args.baseRoll?.toString(),
              adjustedRoll: playerEvent.args.adjustedRoll?.toString(),
              rarityBoost: Number(playerEvent.args.rarityBoost || 0),
              blockNumber: receipt.blockNumber?.toString(),
              transactionHash: hash,
              player: playerEvent.args.player
            })
            
            // DON'T call fetchContractData here - BossFight will handle the refresh
            // This prevents duplicate rapid calls
            
            // Reset transaction status
            setTimeout(() => {
              setTxStatus(null)
              setTxHash(null)
              setIsWriting(false)
              setIsConfirming(false)
              setIsConfirmed(false)
              setTxError(null)
            }, 1000)
            
            return // Event found
          } else {
            console.log('[killBoss] BossKilled event not found via getLogs for this transaction')
          }
        }
      } catch (error) {
        console.error('[killBoss] Error querying for event:', error)
      }

      // If event still not found, wait for event watcher
      setTxStatus('waiting-event')
      
      // Fallback: Refresh data after a delay if event doesn't arrive
      // Removed fallback fetchContractData - it was causing rapid duplicate calls
      // BossFight will handle the refresh when lastEvent is set
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
    inventoryVersion, // Expose version to force re-renders when inventory changes
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
    // Expose wallet clients for other components (e.g., TransferModal)
    walletClient: walletClientRef.current,
    publicClient: publicClientRef.current,
  }
}

export function GameContractProvider({ children }) {
  const value = useProvideGameContract()
  return createElement(GameContractContext.Provider, { value }, children)
}

export function useGameContract() {
  const context = useContext(GameContractContext)
  if (!context) {
    throw new Error('useGameContract must be used within a GameContractProvider')
  }
  return context
}
