import { useState, useEffect } from 'react'
import { useGameContract } from '../hooks/useGameContract'
import { GAME_CONTRACT_ADDRESS, GAME_CONTRACT_ABI, ITEM_TIERS } from '../config/gameContract'
import './TransferModal.css'

function TransferModal({ item, onClose, onSuccess }) {
  // Use the shared wallet clients from GameContractProvider - they're already working!
  const { walletClient, publicClient } = useGameContract()
  const [toAddress, setToAddress] = useState('')
  const [error, setError] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [hash, setHash] = useState(null)
  
  // Clients are ready if they exist (they're already initialized by useGameContract)
  const clientsReady = !!walletClient && !!publicClient

  // Watch for transaction confirmation
  useEffect(() => {
    if (hash && publicClient) {
      const waitForReceipt = async () => {
        try {
          setIsConfirming(true)
          const receipt = await publicClient.waitForTransactionReceipt({ hash })
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
  }, [hash, publicClient, onSuccess, onClose])

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

    if (!clientsReady || !walletClient) {
      setError('Wallet not ready. Please wait a moment and try again.')
      return
    }

    try {
      setIsPending(true)
      console.log('[TransferModal] Initiating transfer to:', toAddress, 'item:', item.id)
      
      const txHash = await walletClient.writeContract({
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
