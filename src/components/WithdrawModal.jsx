import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
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

// Helper to parse MON to wei
const parseMonToWei = (value) => {
  const num = parseFloat(value)
  if (isNaN(num) || num <= 0) return BigInt(0)
  return BigInt(Math.floor(num * 1e18))
}

function WithdrawModal({ onClose, currentBalance }) {
  const { primaryWallet } = useDynamicContext()
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [hash, setHash] = useState(null)
  const [walletClient, setWalletClient] = useState(null)
  const [publicClient, setPublicClient] = useState(null)

  // Initialize wallet clients
  useEffect(() => {
    if (primaryWallet && isEthereumWallet(primaryWallet)) {
      const initClients = async () => {
        try {
          const wc = await primaryWallet.getWalletClient()
          const pc = await primaryWallet.getPublicClient()
          setWalletClient(wc)
          setPublicClient(pc)
        } catch (err) {
          console.error('[WithdrawModal] Failed to init clients:', err)
        }
      }
      initClients()
    }
  }, [primaryWallet])

  // Watch for transaction confirmation
  useEffect(() => {
    if (hash && publicClient) {
      const waitForReceipt = async () => {
        try {
          setIsConfirming(true)
          await publicClient.waitForTransactionReceipt({ hash })
          setIsConfirming(false)
          setIsSuccess(true)
          setTimeout(() => {
            onClose()
          }, 2000)
        } catch (error) {
          console.error('Transaction failed:', error)
          setIsConfirming(false)
          setError('Transaction failed. Please try again.')
        }
      }
      waitForReceipt()
    }
  }, [hash, publicClient, onClose])

  const validateAddress = (addr) => {
    return /^0x[a-fA-F0-9]{40}$/.test(addr)
  }

  const handleSetMax = async () => {
    if (!currentBalance || !publicClient || !toAddress) {
      // Fallback: leave 0.05 MON for gas if we can't estimate
      if (currentBalance) {
        const maxAmount = Number(currentBalance) / 1e18 - 0.05
        if (maxAmount > 0) {
          setAmount(maxAmount.toFixed(6))
        } else {
          setAmount('0')
          setError('Balance too low to cover gas fees')
        }
      }
      return
    }

    try {
      // Try to estimate gas for the transaction
      const gasEstimate = await publicClient.estimateGas({
        to: toAddress,
        value: currentBalance,
        account: primaryWallet?.address,
      })
      
      // Get current gas price
      const gasPrice = await publicClient.getGasPrice()
      
      // Calculate estimated fee with 20% buffer for safety
      const estimatedFee = (gasEstimate * gasPrice * BigInt(120)) / BigInt(100)
      
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
      // Fallback: leave 0.05 MON for gas
      const maxAmount = Number(currentBalance) / 1e18 - 0.05
      if (maxAmount > 0) {
        setAmount(maxAmount.toFixed(6))
      } else {
        setAmount('0')
        setError('Balance too low to cover gas fees')
      }
    }
  }

  const handleWithdraw = async () => {
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

    const amountWei = parseMonToWei(amount)
    if (amountWei <= BigInt(0)) {
      setError('Amount must be greater than 0')
      return
    }

    if (currentBalance && amountWei > currentBalance) {
      setError('Insufficient balance')
      return
    }

    if (!walletClient || !primaryWallet?.address) {
      setError('Wallet not ready. Please wait a moment and try again.')
      return
    }

    try {
      setIsPending(true)
      console.log('[WithdrawModal] Initiating withdrawal to:', toAddress, 'amount:', amount, 'MON')
      
      const txHash = await walletClient.sendTransaction({
        to: toAddress,
        value: amountWei,
        account: primaryWallet.address,
      })
      
      console.log('[WithdrawModal] Transaction submitted:', txHash)
      setHash(txHash)
      setIsPending(false)
    } catch (err) {
      console.error('[WithdrawModal] Withdrawal error:', err)
      let errorMessage = 'Transaction failed. Please try again.'
      if (err.message?.includes('User rejected') || err.message?.includes('rejected')) {
        errorMessage = 'Transaction was rejected by user.'
      } else if (err.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for this transaction.'
      } else if (err.message) {
        errorMessage = err.message.slice(0, 100)
      }
      setError(errorMessage)
      setIsPending(false)
    }
  }

  const clientsReady = !!walletClient && !!publicClient
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
                href={`https://explorer.monad.xyz/tx/${hash}`} 
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
            disabled={!clientsReady || isPending || isConfirming || isSuccess}
          >
            {!clientsReady ? 'Connecting...' :
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

