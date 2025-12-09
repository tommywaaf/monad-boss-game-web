import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSendTransaction, useWaitForTransactionReceipt, usePublicClient, useAccount } from 'wagmi'
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

// Helper to parse MON to wei
const parseMonToWei = (value) => {
  const num = parseFloat(value)
  if (isNaN(num) || num <= 0) return BigInt(0)
  return BigInt(Math.floor(num * 1e18))
}

function WithdrawModal({ onClose, currentBalance }) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  
  // Use wagmi's useSendTransaction hook
  const { sendTransaction, data: hash, isPending, error: txError } = useSendTransaction()
  
  // Use wagmi's useWaitForTransactionReceipt hook
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash,
    }
  })
  
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  // Close modal after successful transaction
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => {
        onClose()
      }, 2000)
    }
  }, [isSuccess, onClose])

  // Set error from transaction error
  useEffect(() => {
    if (txError) {
      let errorMessage = 'Transaction failed. Please try again.'
      if (txError.message?.includes('User rejected') || txError.message?.includes('rejected')) {
        errorMessage = 'Transaction was rejected by user.'
      } else if (txError.message?.includes('insufficient funds') || txError.message?.includes('Insufficient')) {
        errorMessage = 'Insufficient funds. Try reducing the amount slightly.'
      } else if (txError.message?.includes('EVM network not found')) {
        errorMessage = 'Network not configured. Please switch to Monad network and try again.'
      } else if (txError.message) {
        errorMessage = txError.message.slice(0, 100)
      }
      setError(errorMessage)
    }
  }, [txError])

  const validateAddress = (addr) => {
    return /^0x[a-fA-F0-9]{40}$/.test(addr)
  }

  const handleSetMax = async () => {
    if (!currentBalance) {
      return
    }

    // If we don't have publicClient or toAddress, use a conservative fallback
    if (!publicClient || !toAddress || !validateAddress(toAddress)) {
      // Fallback: leave 0.015 MON for gas (conservative estimate)
      const maxAmount = Number(currentBalance) / 1e18 - 0.015
      if (maxAmount > 0) {
        setAmount(maxAmount.toFixed(6))
      } else {
        setAmount('0')
        setError('Balance too low to cover gas fees')
      }
      return
    }

    try {
      // Try to estimate gas for the transaction
      const gasEstimate = await publicClient.estimateGas({
        to: toAddress,
        value: currentBalance,
        account: address,
      })
      
      // Get current gas price
      const gasPrice = await publicClient.getGasPrice()
      
      // Calculate estimated fee with 100% buffer for safety (2x the estimate)
      const estimatedFee = (gasEstimate * gasPrice * BigInt(200)) / BigInt(100)
      
      // Calculate max sendable amount
      const maxSendable = currentBalance - estimatedFee
      
      if (maxSendable > BigInt(0)) {
        const maxAmount = Number(maxSendable) / 1e18
        setAmount(maxAmount.toFixed(6))
      } else {
        setAmount('0')
        setError('Balance too low to cover gas fees')
      }
    } catch (err) {
      console.log('[WithdrawModal] Gas estimation failed, using fallback:', err)
      // Fallback: leave 0.015 MON for gas
      const maxAmount = Number(currentBalance) / 1e18 - 0.015
      if (maxAmount > 0) {
        setAmount(maxAmount.toFixed(6))
      } else {
        setAmount('0')
        setError('Balance too low to cover gas fees')
      }
    }
  }

  const handleWithdraw = () => {
    setError('')
    
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
    if (amountNum <= 0) {
      setError('Amount must be greater than 0')
      return
    }

    const balanceNum = currentBalance ? Number(currentBalance) / 1e18 : 0
    if (amountNum > balanceNum) {
      setError('Insufficient balance')
      return
    }

    if (!address) {
      setError('Wallet not connected. Please connect your wallet and try again.')
      return
    }

    console.log('[WithdrawModal] Initiating withdrawal to:', toAddress, 'amount:', amount, 'MON')
    
    // Convert amount to wei and send transaction
    const amountWei = parseMonToWei(amount)
    
    sendTransaction({
      to: toAddress,
      value: amountWei,
    })
  }

  const walletReady = !!address
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
