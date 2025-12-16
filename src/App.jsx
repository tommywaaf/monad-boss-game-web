import { useDynamicContext, getNetwork, DynamicWidget, DynamicUserProfile } from '@dynamic-labs/sdk-react-core'
import { useEffect, useRef, useState } from 'react'
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
    if (!isConnected || !primaryWallet || isMonadNetwork || hasSwitchedRef.current) {
      if (!isConnected) {
        // Reset when disconnected
        hasSwitchedRef.current = false
      }
      return
    }

    // Only attempt switch once per connection
    hasSwitchedRef.current = true
    
    const switchToMonad = async () => {
      try {
        // Check if the connector supports network switching
        if (primaryWallet.connector?.supportsNetworkSwitching?.()) {
          console.log('Auto-switching to Monad network...')
          await primaryWallet.switchNetwork({ networkChainId: 143 })
        } else if (primaryWallet.switchNetwork) {
          // Try direct switchNetwork method
          console.log('Auto-switching to Monad network (direct method)...')
          await primaryWallet.switchNetwork({ networkChainId: 143 })
        }
      } catch (error) {
        console.error('Failed to auto-switch to Monad network:', error)
        // Reset on error so user can try again manually
        hasSwitchedRef.current = false
      }
    }
    
    // Small delay to ensure wallet is fully initialized
    const timer = setTimeout(switchToMonad, 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, primaryWallet?.address]) // Only depend on address, not entire wallet or chainId

  const isContractDeployed = GAME_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000'

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

      <footer className="app-footer">
        <p>Powered by Monad Network ⚡</p>
      </footer>
    </div>
  </GameContractProvider>
  )
}

export default App
