import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { GAME_CONTRACT_ADDRESS, GAME_CONTRACT_ABI, ITEM_TIERS } from '../config/gameContract'
import './TransferModal.css'

function TransferModal({ item, onClose, onSuccess }) {
  const { address } = useAccount()
  
  // Use wagmi's useWriteContract hook
  const { writeContract, data: hash, isPending, error: txError } = useWriteContract()
  
  // Use wagmi's useWaitForTransactionReceipt hook
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash,
    }
  })
  
  const [toAddress, setToAddress] = useState('')
  const [error, setError] = useState('')
  
  // Check if wallet is connected
  const clientsReady = !!address

  // Handle success
  useEffect(() => {
    if (isSuccess) {
      if (onSuccess) {
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1000)
      }
    }
  }, [isSuccess, onSuccess, onClose])

  // Handle transaction error
  useEffect(() => {
    if (txError) {
      let errorMessage = 'Transaction failed. Please try again.'
      if (txError.message?.includes('User rejected')) {
        errorMessage = 'Transaction was rejected by user.'
      } else if (txError.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for gas.'
      } else if (txError.message) {
        errorMessage = txError.message.slice(0, 100)
      }
      setError(errorMessage)
    }
  }, [txError])

  const validateAddress = (addr) => {
    // Basic Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(addr)
  }

  const handleTransfer = () => {
    setError('')
    
    if (!toAddress) {
      setError('Please enter an address')
      return
    }
    
    if (!validateAddress(toAddress)) {
      setError('Invalid Ethereum address')
      return
    }

    if (!address) {
      setError('Wallet not connected. Please connect your wallet and try again.')
      return
    }

    console.log('[TransferModal] Initiating transfer to:', toAddress, 'item:', item.id)
    
    writeContract({
      address: GAME_CONTRACT_ADDRESS,
      abi: GAME_CONTRACT_ABI,
      functionName: 'transferItem',
      args: [toAddress, BigInt(item.id)]
    })
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
