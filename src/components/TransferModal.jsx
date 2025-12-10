import { useState, useEffect } from 'react'
import { GAME_CONTRACT_ADDRESS, GAME_CONTRACT_ABI, ITEM_TIERS } from '../config/gameContract'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { useGameContract } from '../hooks/useGameContract'
import './TransferModal.css'

function TransferModal({ item, onClose, onSuccess }) {
  const { sdkHasLoaded } = useDynamicContext()
  const { getWalletClient, getPublicClient, primaryWallet } = useGameContract()
  const address = primaryWallet?.address
  
  const [hash, setHash] = useState(null)
  const [isPending, setIsPending] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [txError, setTxError] = useState(null)
  
  const [toAddress, setToAddress] = useState('')
  const [error, setError] = useState('')

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

  const validateAddress = (addr) => {
    return /^0x[a-fA-F0-9]{40}$/.test(addr)
  }

  const handleTransfer = async () => {
    setError('')
    setTxError(null)
    
    if (!sdkHasLoaded) {
      setError('Please wait for wallet to initialize...')
      return
    }
    
    if (!toAddress) {
      setError('Please enter an address')
      return
    }
    
    if (!validateAddress(toAddress)) {
      setError('Invalid Ethereum address')
      return
    }

    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      setError('Wallet not connected.')
      return
    }

    console.log('[TransferModal] Transferring item', item.id, 'to:', toAddress)
    
    setIsPending(true)
    
    try {
      // Use the shared wallet client from context (same one Attack Boss uses)
      const walletClient = await getWalletClient()
      const publicClient = await getPublicClient()
      
      if (!walletClient) {
        throw new Error('Could not get wallet client')
      }

      console.log('[TransferModal] Using shared wallet client...')
      const txHash = await walletClient.writeContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'transferItem',
        args: [toAddress, BigInt(item.id)],
        account: address,
      })
      
      console.log('[TransferModal] Transaction sent:', txHash)
      setHash(txHash)
      setIsPending(false)
      setIsConfirming(true)

      // Wait for receipt
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }
      
      setIsConfirming(false)
      setIsSuccess(true)
    } catch (err) {
      console.error('[TransferModal] Transaction error:', err)
      setTxError(err)
      setIsPending(false)
      setIsConfirming(false)
    }
  }

  const clientsReady = sdkHasLoaded && !!address && !!primaryWallet && isEthereumWallet(primaryWallet)
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
