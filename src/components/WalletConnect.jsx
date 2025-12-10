import { useDynamicContext, getNetwork } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { useEffect, useState } from 'react'
import WithdrawModal from './WithdrawModal'
import './WalletConnect.css'

// Helper to format balance
const formatBalance = (balance) => {
  if (!balance) return '0.00'
  // Convert from wei to MON (18 decimals)
  const balanceNum = Number(balance) / 1e18
  if (balanceNum < 0.0001) {
    return balanceNum.toExponential(2)
  }
  return balanceNum.toFixed(4)
}

function WalletConnect() {
  const dynamicContext = useDynamicContext()
  const { setShowAuthFlow, primaryWallet, handleLogOut, handleLogout } = dynamicContext
  
  // Try both handleLogOut and handleLogout (docs show both variations)
  const logoutFunction = handleLogOut || handleLogout
  
  // Get wallet info from Dynamic
  const address = primaryWallet?.address
  const isConnected = !!primaryWallet
  const [chainId, setChainId] = useState(null)
  const [balance, setBalance] = useState(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  
  // Get chain ID using Dynamic's getNetwork utility
  useEffect(() => {
    if (!primaryWallet?.connector) {
      setChainId(null)
      return
    }

    let cancelled = false
    
    const updateChainId = async () => {
      try {
        const network = await getNetwork(primaryWallet.connector)
        if (cancelled) return
        
        if (network) {
          const id = typeof network === 'number' ? network : network?.chainId || network
          const newChainId = Number(id)
          // Only update if it actually changed
          setChainId(prev => prev !== newChainId ? newChainId : prev)
        }
      } catch {
        if (cancelled) return
        // Fallback to primaryWallet.chain if getNetwork fails
        if (primaryWallet?.chain) {
          let newChainId = null
          if (typeof primaryWallet.chain === 'number') {
            newChainId = primaryWallet.chain
          } else if (typeof primaryWallet.chain === 'string') {
            newChainId = Number(primaryWallet.chain)
          } else if (primaryWallet.chain?.chainId) {
            newChainId = Number(primaryWallet.chain.chainId)
          }
          if (newChainId !== null) {
            setChainId(prev => prev !== newChainId ? newChainId : prev)
          }
        }
      }
    }
    
    updateChainId()
    
    return () => {
      cancelled = true
    }
  }, [primaryWallet?.connector]) // Only depend on connector, not entire wallet

  // Fetch balance when wallet is connected and on Monad network
  useEffect(() => {
    // Only clear balance if we're explicitly on a different network (not when chainId is null/loading)
    if (!isConnected || !primaryWallet || !isEthereumWallet(primaryWallet)) {
      setBalance(null)
      return
    }

    // If chainId is explicitly set and not 143, clear balance
    if (chainId !== null && chainId !== 143) {
      setBalance(null)
      return
    }

    // If chainId is still loading (null), don't clear balance - wait for it to load
    if (chainId === null) {
      return
    }

    // Now we know chainId === 143, fetch balance
    let cancelled = false

    const fetchBalance = async () => {
      try {
        // Pass chainId for embedded wallets on custom networks
        const publicClient = await primaryWallet.getPublicClient('143')
        if (cancelled || !publicClient || !address) return

        const balanceWei = await publicClient.getBalance({ address })
        if (!cancelled) {
          setBalance(balanceWei)
        }
      } catch (error) {
        console.error('Error fetching balance:', error)
        // Don't clear balance on error, just log it
      }
    }

    fetchBalance()
    
    // REDUCED polling to prevent rate limiting - poll every 60 seconds instead of 10
    const interval = setInterval(fetchBalance, 60000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [isConnected, primaryWallet, address, chainId])

  const isMonadNetwork = chainId === 143

  const handleCopyAddress = async () => {
    if (!address) return
    
    try {
      await navigator.clipboard.writeText(address)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (error) {
      console.error('Failed to copy address:', error)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = address
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
      } catch (err) {
        console.error('Fallback copy failed:', err)
      }
      document.body.removeChild(textArea)
    }
  }

  // Check if user is connected via Dynamic embedded wallet
  const isDynamicWallet = primaryWallet?.connector?.isEmbedded || false

  const handleCreateWallet = () => {
    // Open Dynamic auth flow to create embedded wallet
    setShowAuthFlow(true)
  }

  const handleConnectWallet = () => {
    // Open Dynamic auth flow for connecting external wallets
    setShowAuthFlow(true)
  }

  const handleDisconnect = async () => {
    try {
      if (logoutFunction && typeof logoutFunction === 'function') {
        console.log('Disconnecting wallet...')
        await logoutFunction()
        console.log('Wallet disconnected successfully')
      } else {
        console.warn('No logout function available')
      }
    } catch (error) {
      console.error('Error disconnecting wallet:', error)
    }
  }

  return (
    <div className="wallet-connect">
      {!isConnected ? (
        <div className="wallet-options">
          <button 
            className="connect-button primary"
            onClick={handleConnectWallet}
          >
            Connect Wallet
          </button>
          <button 
            className="connect-button secondary"
            onClick={handleCreateWallet}
          >
            Create New Wallet
          </button>
        </div>
      ) : (
        <div className="wallet-info">
          <div className="network-status">
            {isMonadNetwork ? (
              <span className="network-badge monad">✓ Monad Network</span>
            ) : (
              <span className="network-badge wrong">⚠ Wrong Network</span>
            )}
            {isDynamicWallet && (
              <span className="network-badge dynamic">🔐 Dynamic Wallet</span>
            )}
          </div>
          
          <div className="wallet-details">
            {isMonadNetwork && balance !== null && (
              <div className="balance-display">
                <span className="balance-label">Balance:</span>
                <span className="balance-value">{formatBalance(balance)} MON</span>
                <button 
                  className="withdraw-btn"
                  onClick={() => setShowWithdrawModal(true)}
                  title="Withdraw MON"
                >
                  Withdraw
                </button>
              </div>
            )}
            <div className="address-display">
              <button
                className="address-button"
                onClick={handleCopyAddress}
                title="Click to copy address"
              >
                <span className="address">{address}</span>
                {copySuccess && (
                  <span className="copy-success">✓ Copied!</span>
                )}
              </button>
              <button 
                className="disconnect-button"
                onClick={handleDisconnect}
              >
                Disconnect
              </button>
            </div>
          </div>

          {!isMonadNetwork && (
            <button 
              className="change-network-button"
              onClick={async () => {
                try {
                  console.log('Switching to Monad network...')
                  // Try connector method first
                  if (primaryWallet?.connector?.supportsNetworkSwitching?.()) {
                    await primaryWallet.connector.switchNetwork({ networkChainId: 143 })
                  } else if (primaryWallet?.switchNetwork) {
                    // Try direct wallet method
                    await primaryWallet.switchNetwork({ networkChainId: 143 })
                  } else {
                    console.error('Network switching not supported by this wallet')
                  }
                } catch (error) {
                  console.error('Failed to switch network:', error)
                  alert(`Failed to switch network: ${error.message || error}`)
                }
              }}
            >
              Switch to Monad
            </button>
          )}
        </div>
      )}

      {showWithdrawModal && (
        <WithdrawModal 
          onClose={() => setShowWithdrawModal(false)}
          currentBalance={balance}
        />
      )}
    </div>
  )
}

export default WalletConnect

