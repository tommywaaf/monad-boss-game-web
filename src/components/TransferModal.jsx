import { useState, useEffect, useRef } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { GAME_CONTRACT_ADDRESS, GAME_CONTRACT_ABI, ITEM_TIERS } from '../config/gameContract'
import './TransferModal.css'

function TransferModal({ item, onClose, onSuccess }) {
  const { primaryWallet } = useDynamicContext()
  const [toAddress, setToAddress] = useState('')
  const [error, setError] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [hash, setHash] = useState(null)
  const [clientsReady, setClientsReady] = useState(false)
  const walletClientRef = useRef(null)
  const publicClientRef = useRef(null)

  // Initialize clients when wallet is available
  useEffect(() => {
    // Check if we have a valid wallet - support both external and embedded wallets
    const hasValidWallet = primaryWallet && (
      isEthereumWallet(primaryWallet) || 
      (primaryWallet.address && primaryWallet.getWalletClient)
    )
    
    if (hasValidWallet) {
      const initClients = async () => {
        try {
          console.log('[TransferModal] Initializing wallet clients for:', primaryWallet.address)
          console.log('[TransferModal] Wallet type:', primaryWallet.connector?.name || 'unknown')
          
          const walletClient = await primaryWallet.getWalletClient()
          const publicClient = await primaryWallet.getPublicClient()
          
          if (walletClient && publicClient) {
            walletClientRef.current = walletClient
            publicClientRef.current = publicClient
            setClientsReady(true)
            console.log('[TransferModal] ✅ Wallet clients initialized successfully')
          } else {
            console.error('[TransferModal] Failed to get clients:', { walletClient: !!walletClient, publicClient: !!publicClient })
            setClientsReady(false)
          }
        } catch (error) {
          console.error('[TransferModal] Failed to initialize clients:', error)
          setClientsReady(false)
        }
      }
      initClients()
    } else {
      console.log('[TransferModal] No valid wallet found:', { 
        hasWallet: !!primaryWallet, 
        hasAddress: !!primaryWallet?.address,
        isEthereum: primaryWallet ? isEthereumWallet(primaryWallet) : false 
      })
      walletClientRef.current = null
      publicClientRef.current = null
      setClientsReady(false)
    }
  }, [primaryWallet?.address])

  // Watch for transaction confirmation
  useEffect(() => {
    if (hash && publicClientRef.current) {
      const waitForReceipt = async () => {
        try {
          setIsConfirming(true)
          const receipt = await publicClientRef.current.waitForTransactionReceipt({ hash })
          setIsConfirming(false)
          setIsSuccess(true)
          if (onSuccess) {
            setTimeout(() => {
              onSuccess()
              onClose()
            }, 1000)
          }
        } catch (error) {
          console.error('Transaction failed:', error)
          setIsConfirming(false)
          setError('Transaction failed. Please try again.')
        }
      }
      waitForReceipt()
    }
  }, [hash, onSuccess, onClose])

  const validateAddress = (addr) => {
    // Basic Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(addr)
  }

  const handleTransfer = async () => {
    setError('')
    
    if (!toAddress) {
      setError('Please enter an address')
      return
    }
    
    if (!validateAddress(toAddress)) {
      setError('Invalid Ethereum address')
      return
    }

    if (!clientsReady || !walletClientRef.current) {
      setError('Wallet not ready. Please wait a moment and try again.')
      return
    }

    try {
      setIsPending(true)
      console.log('[TransferModal] Initiating transfer to:', toAddress, 'item:', item.id)
      
      const txHash = await walletClientRef.current.writeContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'transferItem',
        args: [toAddress, BigInt(item.id)]
      })
      console.log('[TransferModal] Transaction submitted:', txHash)
      setHash(txHash)
      setIsPending(false)
    } catch (err) {
      console.error('[TransferModal] Transfer error:', err)
      // Provide more helpful error messages
      let errorMessage = 'Transaction failed. Please try again.'
      if (err.message?.includes('User rejected')) {
        errorMessage = 'Transaction was rejected by user.'
      } else if (err.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for gas.'
      } else if (err.message) {
        errorMessage = err.message
      }
      setError(errorMessage)
      setIsPending(false)
    }
  }

  const tierInfo = ITEM_TIERS[item.tier]

  return (
    <div className="transfer-modal-overlay" onClick={onClose}>
      <div className="transfer-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        <h2>🎁 Transfer Item</h2>
        
        <div className="transfer-item-display">
          <div 
            className="item-preview"
            style={{ 
              borderColor: tierInfo.color,
              background: `linear-gradient(135deg, ${tierInfo.color}22, ${tierInfo.color}11)`
            }}
          >
            <div className="item-icon">💎</div>
            <div className="item-tier" style={{ color: tierInfo.color }}>
              {tierInfo.name}
            </div>
            <div className="item-id">#{item.id}</div>
          </div>
        </div>

        <div className="transfer-form">
          <label htmlFor="toAddress">Recipient Address:</label>
          <input
            id="toAddress"
            type="text"
            placeholder="0x..."
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            disabled={isPending || isConfirming}
          />
          
          {error && <div className="error-message">{error}</div>}
          
          {isSuccess && (
            <div className="success-message">
              ✅ Item transferred successfully!
            </div>
          )}
          
          {isConfirming && (
            <div className="confirming-message">
              ⏳ Confirming transaction...
            </div>
          )}
        </div>

        <div className="transfer-warning">
          ⚠️ <strong>Warning:</strong> This action cannot be undone. Make sure the address is correct!
        </div>

        <div className="transfer-actions">
          <button 
            className="cancel-button"
            onClick={onClose}
            disabled={isPending || isConfirming}
          >
            Cancel
          </button>
          <button 
            className="transfer-button"
            onClick={handleTransfer}
            disabled={!clientsReady || isPending || isConfirming || isSuccess}
          >
            {!clientsReady ? 'Connecting wallet...' :
             isPending ? 'Waiting for approval...' : 
             isConfirming ? 'Transferring...' :
             isSuccess ? 'Transferred!' : 
             'Transfer Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TransferModal
