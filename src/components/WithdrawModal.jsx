import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { parseEther } from 'viem'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import './WithdrawModal.css'

// Helper to format balance for display
const formatBalance = (balance) => {
  if (!balance) return '0'
  const balanceNum = Number(balance) / 1e18
  if (balanceNum < 0.0001 && balanceNum > 0) {
    return balanceNum.toExponential(4)
  }
  return balanceNum.toFixed(6)
}

function WithdrawModal({ onClose, currentBalance }) {
  const { address } = useAccount()
  const { primaryWallet } = useDynamicContext()
  
  // Track transaction state manually since we use Dynamic's wallet client
  const [hash, setHash] = useState(null)
  const [isPending, setIsPending] = useState(false)
  const [txError, setTxError] = useState(null)
  
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash }
  })
  
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  
  // Reset function to clear transaction state
  const reset = () => {
    setHash(null)
    setIsPending(false)
    setTxError(null)
  }

  // Handle transaction error
  useEffect(() => {
    if (txError) {
      let errorMessage = 'Transaction failed. Please try again.'
      if (txError.message?.includes('User rejected') || txError.message?.includes('rejected')) {
        errorMessage = 'Transaction was rejected by user.'
      } else if (txError.message?.includes('insufficient funds') || txError.message?.includes('Insufficient')) {
        errorMessage = 'Insufficient funds. Try reducing the amount slightly.'
      } else if (txError.message) {
        errorMessage = txError.message.slice(0, 100)
      }
      setError(errorMessage)
    }
  }, [txError])

  // Close modal after success
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => {
        reset()
        onClose()
      }, 2000)
    }
  }, [isSuccess, onClose, reset])

  const validateAddress = (addr) => {
    return /^0x[a-fA-F0-9]{40}$/.test(addr)
  }

  const handleSetMax = () => {
    if (!currentBalance) return
    // Leave 0.015 MON for gas
    const maxAmount = Number(currentBalance) / 1e18 - 0.015
    if (maxAmount > 0) {
      setAmount(maxAmount.toFixed(6))
    } else {
      setAmount('0')
      setError('Balance too low to cover gas fees')
    }
  }

  const handleWithdraw = async () => {
    setError('')
    setTxError(null)
    
    if (!toAddress) {
      setError('Please enter a destination address')
      return
    }
    
    if (!validateAddress(toAddress)) {
      setError('Invalid Ethereum address')
      return
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    const amountNum = parseFloat(amount)
    const balanceNum = currentBalance ? Number(currentBalance) / 1e18 : 0
    if (amountNum > balanceNum) {
      setError('Insufficient balance')
      return
    }

    if (!address || !primaryWallet || !isEthereumWallet(primaryWallet)) {
      setError('Wallet not connected.')
      return
    }

    console.log('[WithdrawModal] Sending transaction to:', toAddress, 'amount:', amount, 'MON')
    
    setIsPending(true)
    
    try {
      // Use Dynamic's wallet client for transaction - works for both embedded and external wallets
      const walletClient = await primaryWallet.getWalletClient()
      
      const txHash = await walletClient.sendTransaction({
        to: toAddress,
        value: parseEther(amount),
      })
      
      console.log('[WithdrawModal] Transaction sent:', txHash)
      setHash(txHash)
    } catch (err) {
      console.error('[WithdrawModal] Transaction error:', err)
      setTxError(err)
    } finally {
      setIsPending(false)
    }
  }

  const walletReady = !!address && !!primaryWallet && isEthereumWallet(primaryWallet)
  const formattedBalance = currentBalance ? formatBalance(currentBalance) : '0'

  return createPortal(
    <div className="withdraw-modal-overlay" onClick={onClose}>
      <div className="withdraw-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        <h2>💸 Withdraw MON</h2>
        
        <div className="withdraw-balance-display">
          <span className="balance-label">Available Balance:</span>
          <span className="balance-amount">{formattedBalance} MON</span>
        </div>

        <div className="withdraw-form">
          <div className="form-group">
            <label htmlFor="toAddress">Destination Address:</label>
            <input
              id="toAddress"
              type="text"
              placeholder="0x..."
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              disabled={isPending || isConfirming || isSuccess}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="amount">Amount (MON):</label>
            <div className="amount-input-wrapper">
              <input
                id="amount"
                type="number"
                step="0.000001"
                min="0"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isPending || isConfirming || isSuccess}
              />
              <button 
                className="max-button"
                onClick={handleSetMax}
                disabled={isPending || isConfirming || isSuccess || !currentBalance}
                type="button"
              >
                MAX
              </button>
            </div>
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          {isSuccess && (
            <div className="success-message">
              ✅ Withdrawal successful!
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

        <div className="withdraw-warning">
          ⚠️ <strong>Warning:</strong> Double-check the address! Transactions cannot be reversed.
        </div>

        <div className="withdraw-actions">
          <button 
            className="cancel-button"
            onClick={onClose}
            disabled={isPending || isConfirming}
          >
            Cancel
          </button>
          <button 
            className="withdraw-button"
            onClick={handleWithdraw}
            disabled={!walletReady || isPending || isConfirming || isSuccess}
          >
            {!walletReady ? 'Connecting...' :
             isPending ? 'Waiting for approval...' : 
             isConfirming ? 'Confirming...' :
             isSuccess ? 'Done!' : 
             'Withdraw MON'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default WithdrawModal
