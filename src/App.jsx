import { useDynamicContext, getNetwork, DynamicWidget, DynamicUserProfile } from '@dynamic-labs/sdk-react-core'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import BossFight from './components/BossFight'
import Inventory from './components/Inventory'
import AccountPanel from './components/AccountPanel'
// import Leaderboard from './components/Leaderboard' // DISABLED - causing RPC issues
import { GameContractProvider } from './hooks/useGameContract'
import { GAME_CONTRACT_ADDRESS } from './config/gameContract'
import './App.css'

// Frontend version: Updated for improved randomness testing
function App() {
  const { primaryWallet } = useDynamicContext()
  const isConnected = !!primaryWallet
  const hasSwitchedRef = useRef(false)
  const [chainId, setChainId] = useState(null)
  
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
  
  const isMonadNetwork = chainId === 143
  
  // Automatically switch to Monad network when wallet connects (only once)
  useEffect(() => {
    if (!isConnected || !primaryWallet) {
      // Reset when disconnected
      hasSwitchedRef.current = false
      return
    }
    
    // For embedded wallets, ALWAYS try to switch to Monad (don't check isMonadNetwork)
    // because our chainId detection defaults to 143 but the wallet isn't actually on Monad yet
    const isEmbedded = primaryWallet.connector?.isEmbedded
    
    // Skip if already switched (unless it's an embedded wallet on first connect)
    if (hasSwitchedRef.current) {
      return
    }
    
    // For external wallets, skip if already on Monad
    if (!isEmbedded && isMonadNetwork) {
      return
    }

    // Only attempt switch once per connection
    hasSwitchedRef.current = true
    
    const switchToMonad = async () => {
      try {
        console.log(`Auto-switching ${isEmbedded ? 'embedded' : 'external'} wallet to Monad network...`)
        
        // Try connector method first
        if (primaryWallet.connector?.supportsNetworkSwitching?.()) {
          await primaryWallet.connector.switchNetwork({ networkChainId: 143 })
        } else if (primaryWallet.switchNetwork) {
          // Try direct wallet method
          await primaryWallet.switchNetwork({ networkChainId: 143 })
        } else {
          console.warn('Network switching not supported by this wallet')
        }
        
        // After switching, update chainId
        if (isEmbedded) {
          setChainId(143)
        }
      } catch (error) {
        console.error('Failed to auto-switch to Monad network:', error)
        // Reset on error so user can try again manually
        hasSwitchedRef.current = false
      }
    }
    
    // Small delay to ensure wallet is fully initialized
    // Embedded wallets need more time for the Waas SDK
    const delay = isEmbedded ? 2000 : 1000
    const timer = setTimeout(switchToMonad, delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, primaryWallet?.address]) // Only depend on address, not entire wallet or chainId

  const isContractDeployed = GAME_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000'
  const location = useLocation()
  const isHomePage = location.pathname === '/' || location.pathname === ''

  return (
    <GameContractProvider>
      <DynamicUserProfile />
      <div className="app">
      <nav className="app-navbar">
        <div className="navbar-content">
          <div className="navbar-left">
            <h1 className="navbar-title">🎮 Monad Boss Game</h1>
          </div>
          <div className="navbar-right">
            <DynamicWidget />
          </div>
        </div>
      </nav>

      <div className="app-content-wrapper">
        <nav className="page-sidebar">
          <div className="sidebar-header">
            <h3>Navigation</h3>
          </div>
          <div className="sidebar-links">
            <Link 
              to="/" 
              className={`sidebar-link ${isHomePage ? 'active' : ''}`}
            >
              <span className="sidebar-icon">🎮</span>
              <span className="sidebar-text">Game</span>
            </Link>
            <Link 
              to="/broadcaster" 
              className={`sidebar-link ${location.pathname === '/broadcaster' ? 'active' : ''}`}
            >
              <span className="sidebar-icon">🚀</span>
              <span className="sidebar-text">Broadcaster</span>
            </Link>
            <Link 
              to="/simulator" 
              className={`sidebar-link ${location.pathname === '/simulator' ? 'active' : ''}`}
            >
              <span className="sidebar-icon">⚡</span>
              <span className="sidebar-text">Simulator</span>
            </Link>
            <Link 
              to="/ton-details" 
              className={`sidebar-link ${location.pathname === '/ton-details' ? 'active' : ''}`}
            >
              <span className="sidebar-icon">🔍</span>
              <span className="sidebar-text">Ton Details</span>
            </Link>
            <Link 
              to="/ton-batch-lookup" 
              className={`sidebar-link ${location.pathname === '/ton-batch-lookup' ? 'active' : ''}`}
            >
              <span className="sidebar-icon">📋</span>
              <span className="sidebar-text">TON Batch Lookup</span>
            </Link>
            <Link 
              to="/btc-safe-to-fail" 
              className={`sidebar-link ${location.pathname === '/btc-safe-to-fail' ? 'active' : ''}`}
            >
              <span className="sidebar-icon">₿</span>
              <span className="sidebar-text">BTC Safe-to-Fail</span>
            </Link>
          </div>
        </nav>

      <main className="app-main">

        {!isConnected && (
          <div className="game-section">
            <div className="info-card">
              <h3>ℹ️ How to Play</h3>
              <ol>
                <li>Connect your wallet or create a new one</li>
                <li>Switch to Monad network (Chain ID: 143)</li>
                <li>Attack the boss to earn items</li>
                <li>Collect items to boost your success rate</li>
                <li>Build the ultimate inventory!</li>
              </ol>
              <div className="game-features">
                <h4>🎯 Game Features:</h4>
                <ul>
                  <li>🗡️ Boss battles with 100% base success rate</li>
                  <li>💎 10 item tiers from Common to Rainbow</li>
                  <li>📦 20-item inventory with auto-upgrade</li>
                  <li>📈 Items boost success & rarity chances</li>
                  <li>🔄 P2P trading system (coming soon)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {isConnected && !isMonadNetwork && (
          <div className="game-section">
            <div className="warning-card">
              <h3>⚠️ Wrong Network</h3>
              <p>Please switch to Monad network to play the game.</p>
              <button 
                className="switch-network-btn" 
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
                      alert('Network switching is not supported by this wallet. Please switch manually in your wallet.')
                    }
                  } catch (error) {
                    console.error('Failed to switch network:', error)
                    alert(`Failed to switch network: ${error.message || error}`)
                  }
                }}
              >
                Switch to Monad
              </button>
            </div>
          </div>
        )}

        {isConnected && isMonadNetwork && !isContractDeployed && (
          <div className="game-section">
            <div className="warning-card">
              <h3>🚧 Setup Required</h3>
              <p>The game contract hasn't been deployed yet.</p>
              <div className="deploy-instructions">
                <h4>To deploy:</h4>
                <ol>
                  <li>Install Hardhat dependencies: <code>npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox dotenv</code></li>
                  <li>Create a <code>.env</code> file with your private key</li>
                  <li>Run: <code>npx hardhat run scripts/deploy.js --network monad</code></li>
                  <li>Add the contract address to your <code>.env</code> file</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {isConnected && isMonadNetwork && isContractDeployed && (
          <>
            <div className="game-section">
              <div className="game-grid">
                <BossFight />
                <Inventory />
              </div>
            </div>
            
            <div className="account-section">
              <AccountPanel />
            </div>
          </>
        )}
      </main>
      </div>

      <footer className="app-footer">
        <p>Powered by Monad Network ⚡</p>
      </footer>
    </div>
  </GameContractProvider>
  )
}

export default App
