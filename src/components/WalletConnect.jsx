import { useDynamicContext, getNetwork } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { useEffect, useState } from 'react'
import './WalletConnect.css'

function WalletConnect() {
  const dynamicContext = useDynamicContext()
  const { setShowAuthFlow, primaryWallet, handleLogOut, handleLogout } = dynamicContext
  
  // Try both handleLogOut and handleLogout (docs show both variations)
  const logoutFunction = handleLogOut || handleLogout
  
  // Get wallet info from Dynamic
  const address = primaryWallet?.address
  const isConnected = !!primaryWallet
  const [chainId, setChainId] = useState(null)
  
  // Get chain ID using Dynamic's getNetwork utility
  useEffect(() => {
    if (primaryWallet?.connector) {
      getNetwork(primaryWallet.connector).then((network) => {
        if (network) {
          const id = typeof network === 'number' ? network : network?.chainId || network
          setChainId(Number(id))
        }
      }).catch(() => {
        // Fallback to primaryWallet.chain if getNetwork fails
        if (primaryWallet?.chain) {
          if (typeof primaryWallet.chain === 'number') {
            setChainId(primaryWallet.chain)
          } else if (typeof primaryWallet.chain === 'string') {
            setChainId(Number(primaryWallet.chain))
          } else if (primaryWallet.chain?.chainId) {
            setChainId(Number(primaryWallet.chain.chainId))
          }
        }
      })
    } else {
      setChainId(null)
    }
  }, [primaryWallet])

  const truncateAddress = (addr) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const isMonadNetwork = chainId === 143

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
          
          <div className="address-display">
            <span className="address">{truncateAddress(address)}</span>
            <button 
              className="disconnect-button"
              onClick={handleDisconnect}
            >
              Disconnect
            </button>
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
    </div>
  )
}

export default WalletConnect

