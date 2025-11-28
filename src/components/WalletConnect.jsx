import { useAccount, useDisconnect, useChainId } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import './WalletConnect.css'

function WalletConnect() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { open } = useWeb3Modal()
  const chainId = useChainId()
  const { setShowAuthFlow, primaryWallet, handleLogout } = useDynamicContext()

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
    if (isDynamicWallet) {
      // For Dynamic wallets, use handleLogout
      await handleLogout()
    } else {
      // For external wallets (MetaMask, WalletConnect), use Wagmi disconnect
      disconnect()
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

