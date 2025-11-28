import { useAccount, useDisconnect, useChainId } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import './WalletConnect.css'

function WalletConnect() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { open } = useWeb3Modal()
  const chainId = useChainId()

  const truncateAddress = (addr) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const isMonadNetwork = chainId === 143

  return (
    <div className="wallet-connect">
      {!isConnected ? (
        <button 
          className="connect-button"
          onClick={() => open()}
        >
          Connect Wallet
        </button>
      ) : (
        <div className="wallet-info">
          <div className="network-status">
            {isMonadNetwork ? (
              <span className="network-badge monad">✓ Monad Network</span>
            ) : (
              <span className="network-badge wrong">⚠ Wrong Network</span>
            )}
          </div>
          
          <div className="address-display">
            <span className="address">{truncateAddress(address)}</span>
            <button 
              className="disconnect-button"
              onClick={() => disconnect()}
            >
              Disconnect
            </button>
          </div>

          <button 
            className="change-network-button"
            onClick={() => open({ view: 'Networks' })}
          >
            Switch Network
          </button>
        </div>
      )}
    </div>
  )
}

export default WalletConnect

