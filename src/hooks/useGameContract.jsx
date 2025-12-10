import { useReadContract, useAccount } from 'wagmi'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { GAME_CONTRACT_ABI, GAME_CONTRACT_ADDRESS } from '../config/gameContract'
import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'
import { formatEther, decodeEventLog } from 'viem'

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
  const { address } = useAccount()
  const { primaryWallet } = useDynamicContext()
  
  const [txHash, setTxHash] = useState(null)
  const [isWriting, setIsWriting] = useState(false)
  const [writeError, setWriteError] = useState(null)
  const [lastEvent, setLastEvent] = useState(null)
  const [txStatus, setTxStatus] = useState(null)
  const [inventoryVersion, setInventoryVersion] = useState(0)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const processedTxRef = useRef(null)

  // Read inventory
  const { data: inventory, refetch: refetchInventory } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    functionName: 'getInventory',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      staleTime: 30000,
      refetchOnWindowFocus: false,
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
      staleTime: 30000,
      refetchOnWindowFocus: false,
    }
  })

  // Read global boss kills
  const { data: globalKills, refetch: refetchGlobalKills } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    functionName: 'totalBossesKilled',
    query: {
      staleTime: 60000,
      refetchOnWindowFocus: false,
    }
  })

  // Read rake fee
  const { data: rakeFeeWei } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    functionName: 'RAKE_FEE',
    query: {
      staleTime: 300000,
      refetchOnWindowFocus: false,
    }
  })

  // Process transaction receipt to extract event data
  const processReceipt = useCallback(async (hash) => {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) return
    if (processedTxRef.current === hash) return
    
    try {
      console.log('[useGameContract] Getting receipt for:', hash)
      // Pass chainId for embedded wallets on custom networks
      const publicClient = await primaryWallet.getPublicClient('143')
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      
      console.log('[useGameContract] Receipt received:', receipt.status)
      processedTxRef.current = hash
      setIsConfirming(false)
      setIsConfirmed(true)
      
      if (receipt.status === 'success' && receipt.logs) {
        // Find BossKilled event in logs
        for (const log of receipt.logs) {
          if (log.address?.toLowerCase() !== GAME_CONTRACT_ADDRESS.toLowerCase()) continue
          
          try {
            const decoded = decodeEventLog({
              abi: GAME_CONTRACT_ABI,
              data: log.data,
              topics: log.topics,
            })
            
            console.log('[useGameContract] Decoded event:', decoded)
            
            if (decoded.eventName === 'BossKilled') {
              const args = decoded.args
              
              if (args.player?.toLowerCase() === address?.toLowerCase()) {
                console.log('[useGameContract] BossKilled event found!')
                
                setLastEvent({
                  type: 'success',
                  tier: Number(args.tier),
                  itemId: args.itemId?.toString(),
                  baseRoll: args.baseRoll?.toString(),
                  baseTier: Number(args.baseTier),
                  upgraded: args.upgraded,
                  transactionHash: hash,
                })
                
                // Refetch data
                setTimeout(() => {
                  refetchInventory()
                  refetchBoosts()
                  refetchGlobalKills()
                  setInventoryVersion(v => v + 1)
                }, 500)
                
                break
              }
            }
          } catch (e) {
            console.log('[useGameContract] Could not decode log:', e.message)
          }
        }
      }
    } catch (error) {
      console.error('[useGameContract] Error processing receipt:', error)
      setWriteError(error)
      setIsConfirming(false)
    }
  }, [primaryWallet, address, refetchInventory, refetchBoosts, refetchGlobalKills])

  // Reset status when event is received
  useEffect(() => {
    if (lastEvent && (txStatus === 'waiting-event' || txStatus === 'confirmed')) {
      setTimeout(() => {
        setTxStatus(null)
        setTxHash(null)
        setIsWriting(false)
        setIsConfirming(false)
        setIsConfirmed(false)
        processedTxRef.current = null
      }, 1000)
    }
  }, [lastEvent, txStatus])

  // Update status based on state
  useEffect(() => {
    if (isWriting && !txHash) {
      setTxStatus('preparing')
    } else if (txHash && isConfirming) {
      setTxStatus('confirming')
    } else if (txHash && isConfirmed && !lastEvent) {
      setTxStatus('waiting-event')
    } else if (txHash && isConfirmed && lastEvent) {
      setTxStatus('confirmed')
    }
  }, [isWriting, txHash, isConfirming, isConfirmed, lastEvent])

  const killBoss = useCallback(async () => {
    if (!rakeFeeWei) {
      console.log('[killBoss] No rake fee, cannot kill boss')
      return
    }
    
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      console.log('[killBoss] No wallet or not Ethereum wallet')
      return
    }
    
    console.log('[killBoss] Starting boss kill...')
    console.log('[killBoss] Contract:', GAME_CONTRACT_ADDRESS)
    console.log('[killBoss] Value:', rakeFeeWei.toString(), 'wei')
    console.log('[killBoss] Wallet type:', primaryWallet.connector?.name || 'unknown')
    
    setTxStatus('preparing')
    setLastEvent(null)
    setWriteError(null)
    setIsWriting(true)
    setTxHash(null)
    setIsConfirming(false)
    setIsConfirmed(false)
    processedTxRef.current = null
    
    try {
      // Use Dynamic's wallet client directly - works for both embedded and external wallets
      // Pass chainId for embedded wallets on custom networks
      const walletClient = await primaryWallet.getWalletClient('143')
      
      console.log('[killBoss] Got wallet client, sending transaction...')
      
      const hash = await walletClient.writeContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'killBoss',
        value: rakeFeeWei,
        account: primaryWallet.address,
      })
      
      console.log('[killBoss] Transaction submitted:', hash)
      setTxHash(hash)
      setIsWriting(false)
      setIsConfirming(true)
      setTxStatus('submitted')
      
      // Process the receipt
      await processReceipt(hash)
      
    } catch (error) {
      console.error('[killBoss] Error:', error)
      setWriteError(error)
      setTxStatus('failed')
      setIsWriting(false)
      setIsConfirming(false)
    }
  }, [primaryWallet, rakeFeeWei, processReceipt])

  const resetTransaction = useCallback(() => {
    setTxHash(null)
    setTxStatus(null)
    setLastEvent(null)
    setWriteError(null)
    setIsWriting(false)
    setIsConfirming(false)
    setIsConfirmed(false)
    processedTxRef.current = null
  }, [])

  // Parse inventory
  const inventoryItems = inventory ? inventory.map(item => ({
    tier: Number(item.tier),
    id: item.id.toString()
  })) : []

  // Parse boosts
  const rarityBoost = boosts ? Number(boosts[0]) / 100 : 0

  const rakeFeeMon = rakeFeeWei ? formatEther(rakeFeeWei) : '0'

  const value = {
    inventory: inventoryItems,
    refetchInventory,
    inventoryVersion,
    rarityBoost,
    rakeFeeMon,
    globalBossesKilled: globalKills ? Number(globalKills) : 0,
    killBoss,
    isKilling: isWriting || isConfirming || !!txStatus,
    txStatus,
    txHash,
    txError: writeError,
    isConfirming,
    isConfirmed,
    resetTransaction,
    lastEvent,
    clearLastEvent: () => setLastEvent(null),
  }

  return (
    <GameContractContext.Provider value={value}>
      {children}
    </GameContractContext.Provider>
  )
}
