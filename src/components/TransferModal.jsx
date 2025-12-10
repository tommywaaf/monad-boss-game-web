import { useState } from 'react'
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
  
  const clientsReady = !!primaryWallet && isEthereumWallet(primaryWallet)

  const validateAddress = (addr) => {
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

    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      setError('Wallet not connected. Please connect your wallet and try again.')
      return
    }

    try {
      setIsPending(true)
      console.log('[TransferModal] Initiating transfer to:', toAddress, 'item:', item.id)
      
      // For embedded wallets, we need to switch to the Monad network first
      const isEmbedded = primaryWallet.connector?.isEmbedded
      console.log('[TransferModal] Is embedded wallet:', isEmbedded)
      
      if (isEmbedded) {
        try {
          await primaryWallet.switchNetwork(143)
          console.log('[TransferModal] Network switched successfully')
        } catch (switchError) {
          console.log('[TransferModal] Network switch error:', switchError.message)
        }
      }
      
      // Get wallet client - pass chainId as string for custom networks
      const walletClient = await primaryWallet.getWalletClient('143')
      
      console.log('[TransferModal] Got wallet client, sending transaction...')
      
      const txHash = await walletClient.writeContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'transferItem',
        args: [toAddress, BigInt(item.id)],
        account: primaryWallet.address,
      })
      
      console.log('[TransferModal] Transaction submitted:', txHash)
      setHash(txHash)
      setIsPending(false)
      setIsConfirming(true)
      
      // Wait for receipt - pass chainId for embedded wallets
      const publicClient = await primaryWallet.getPublicClient('143')
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      
      console.log('[TransferModal] Transaction confirmed!')
      setIsConfirming(false)
      setIsSuccess(true)
      
      if (onSuccess) {
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1000)
      }
      
    } catch (err) {
      console.error('[TransferModal] Transfer error:', err)
      let errorMessage = 'Transaction failed. Please try again.'
      if (err.message?.includes('User rejected')) {
        errorMessage = 'Transaction was rejected by user.'
      } else if (err.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for gas.'
      } else if (err.message) {
        errorMessage = err.message.slice(0, 100)
      }
      setError(errorMessage)
      setIsPending(false)
      setIsConfirming(false)
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
          
          {hash && !isSuccess && (
            <div className="tx-hash-display">
              <span>Tx: </span>
              <a 
                href={`https://monad.socialscan.io/tx/${hash}`} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                {hash.slice(0, 10)}...{hash.slice(-8)}
              </a>
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
