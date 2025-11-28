import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { GAME_CONTRACT_ABI, GAME_CONTRACT_ADDRESS } from '../config/gameContract'
import { useState, useEffect, useCallback, useRef } from 'react'
import { formatEther, parseEther } from 'viem'

export function useGameContract() {
  const { primaryWallet } = useDynamicContext()
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
  const publicClientRef = useRef(null)
  const walletClientRef = useRef(null)

  // Initialize clients when wallet is available
  useEffect(() => {
    if (primaryWallet && isEthereumWallet(primaryWallet)) {
      const initClients = async () => {
        try {
          const publicClient = await primaryWallet.getPublicClient()
          const walletClient = await primaryWallet.getWalletClient()
          publicClientRef.current = publicClient
          walletClientRef.current = walletClient
        } catch (error) {
          console.error('Failed to initialize clients:', error)
        }
      }
      initClients()
    } else {
      publicClientRef.current = null
      walletClientRef.current = null
    }
  }, [primaryWallet])

  // Read contract data
  const fetchContractData = useCallback(async () => {
    if (!publicClientRef.current || !primaryWallet?.address) return

    try {
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

      // Read rake fee
      const rakeFeeWei = await publicClientRef.current.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'RAKE_FEE',
      })
      setRakeFeeMon(formatEther(rakeFeeWei))

      // Read global kills
      const globalKills = await publicClientRef.current.readContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'totalBossesKilled',
      })
      setGlobalBossesKilled(Number(globalKills))
    } catch (error) {
      console.error('Error fetching contract data:', error)
    }
  }, [primaryWallet?.address])

  // Fetch data on mount and when address changes
  useEffect(() => {
    if (primaryWallet?.address && publicClientRef.current) {
      fetchContractData()
      // Set up polling for contract data
      const interval = setInterval(fetchContractData, 10000) // Poll every 10 seconds
      return () => clearInterval(interval)
    }
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
    if (!walletClientRef.current || !publicClientRef.current || !rakeFeeMon || rakeFeeMon === '0') {
      console.error('Wallet or fee not ready')
      return
    }

    try {
      setTxStatus('preparing')
      setIsWriting(true)
      setTxError(null)

      const hash = await walletClientRef.current.writeContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'killBoss',
        value: parseEther(rakeFeeMon),
      })

      setTxHash(hash)
      setTxStatus('submitted')
      setIsConfirming(true)

      // Wait for transaction receipt
      const receipt = await publicClientRef.current.waitForTransactionReceipt({ hash })
      setIsConfirming(false)
      setIsConfirmed(true)
      setTxStatus('confirmed')

      // Wait a bit for events
      setTimeout(() => {
        setTxStatus('waiting-event')
      }, 500)
    } catch (error) {
      console.error('Error killing boss:', error)
      setTxError(error)
      setTxStatus('failed')
      setIsWriting(false)
      setIsConfirming(false)
    }
  }, [rakeFeeMon])

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
