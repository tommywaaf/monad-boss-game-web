import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import './WalletConnect.css'

function WalletConnect() {
  const dynamicContext = useDynamicContext()
  const { setShowAuthFlow, primaryWallet, handleLogOut, handleLogout } = dynamicContext
  
  // Try both handleLogOut and handleLogout (docs show both variations)
  const logoutFunction = handleLogOut || handleLogout
  
  // Get wallet info from Dynamic
  const address = primaryWallet?.address
  const isConnected = !!primaryWallet
  
  // Get chain ID - Dynamic may expose it as a number, string, or object
  let chainId = null
  if (primaryWallet?.chain) {
    if (typeof primaryWallet.chain === 'number') {
      chainId = primaryWallet.chain
    } else if (typeof primaryWallet.chain === 'string') {
      chainId = Number(primaryWallet.chain)
    } else if (primaryWallet.chain?.chainId) {
      chainId = Number(primaryWallet.chain.chainId)
    }
  }

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

          {!isDynamicWallet && primaryWallet?.connector?.supportsNetworkSwitching && (
            <button 
              className="change-network-button"
              onClick={async () => {
                try {
                  await primaryWallet.switchNetwork({ networkChainId: 143 })
                } catch (error) {
                  console.error('Failed to switch network:', error)
                }
              }}
            >
              Switch Network
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default WalletConnect

