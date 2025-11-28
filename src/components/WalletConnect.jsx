import { useAccount, useDisconnect, useChainId } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { disconnect as wagmiDisconnect } from '@wagmi/core'
import { config } from '../config/wagmiConfig'
import './WalletConnect.css'

function WalletConnect() {
  const { address, isConnected, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const { open } = useWeb3Modal()
  const chainId = useChainId()
  const dynamicContext = useDynamicContext()
  const { setShowAuthFlow, primaryWallet, handleLogOut, handleLogout } = dynamicContext
  
  // Try both handleLogOut and handleLogout (docs show both variations)
  const logoutFunction = handleLogOut || handleLogout

  const truncateAddress = (addr) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const isMonadNetwork = chainId === 143

  // Check if user is connected via Dynamic embedded wallet
  const isDynamicWallet = primaryWallet !== null

  const handleCreateWallet = () => {
    // Open Dynamic auth flow to create embedded wallet
    setShowAuthFlow(true)
  }

  const handleConnectWallet = () => {
    // Open Web3Modal for external wallets (MetaMask, WalletConnect, etc.)
    open()
  }

  const handleDisconnect = async () => {
    try {
      // If it's a Dynamic wallet, logout from Dynamic first
      if (isDynamicWallet && primaryWallet) {
        console.log('Disconnecting Dynamic wallet...')
        
        // Disconnect the primary wallet
        if (primaryWallet && typeof primaryWallet.disconnect === 'function') {
          console.log('Calling primaryWallet.disconnect()...')
          try {
            await primaryWallet.disconnect()
          } catch (e) {
            console.warn('primaryWallet.disconnect error:', e)
          }
        }
        
        // Logout from Dynamic (this clears the session)
        if (logoutFunction && typeof logoutFunction === 'function') {
          console.log('Calling logout function...')
          try {
            await logoutFunction()
          } catch (e) {
            console.warn('logoutFunction error:', e)
          }
        }
      }
      
      // Always disconnect from Wagmi (works for both Dynamic and external wallets)
      console.log('Disconnecting from Wagmi...', { connector: connector?.name, isConnected })
      
      // Use core disconnect which is more reliable
      try {
        await wagmiDisconnect(config)
        console.log('Wagmi disconnected successfully')
      } catch (e) {
        console.warn('Core disconnect failed, trying hook disconnect:', e)
        // Fallback: use hook disconnect
        try {
          disconnect()
        } catch (hookError) {
          console.error('Hook disconnect also failed:', hookError)
        }
      }
      
    } catch (error) {
      console.error('Error disconnecting wallet:', error)
      // Fallback: always try both disconnect methods
      try {
        await wagmiDisconnect(config)
      } catch (e1) {
        try {
          disconnect()
        } catch (e2) {
          console.error('All disconnect methods failed:', e2)
        }
      }
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

          {!isDynamicWallet && (
            <button 
              className="change-network-button"
              onClick={() => open({ view: 'Networks' })}
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

