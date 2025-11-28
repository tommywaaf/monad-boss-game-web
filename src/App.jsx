import { useAccount, useChainId } from 'wagmi'
import WalletConnect from './components/WalletConnect'
import BossFight from './components/BossFight'
import Inventory from './components/Inventory'
import Leaderboard from './components/Leaderboard'
import { useDynamicWalletFund } from './hooks/useDynamicWalletFund'
import { GAME_CONTRACT_ADDRESS } from './config/gameContract'
import './App.css'

// Frontend version: Updated for improved randomness testing
function App() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const isMonadNetwork = chainId === 143
  
  // Hook to automatically fund Dynamic wallets when created
  useDynamicWalletFund()

  const isContractDeployed = GAME_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000'

  return (
    <div className="app">
      <nav className="app-navbar">
        <div className="navbar-content">
          <div className="navbar-left">
            <h1 className="navbar-title">🎮 Monad Boss Game</h1>
          </div>
          <div className="navbar-right">
            <WalletConnect />
          </div>
        </div>
      </nav>

      <main className="app-main">

        {!isConnected && (
          <div className="game-section">
            <div className="info-card">
              <h3>ℹ️ How to Play</h3>
              <ol>
                <li>Connect your wallet (MetaMask or WalletConnect)</li>
                <li>Switch to Monad network (Chain ID: 143)</li>
                <li>Attack the boss to earn items</li>
                <li>Collect items to boost your success rate</li>
                <li>Build the ultimate inventory!</li>
              </ol>
              <div className="game-features">
                <h4>🎯 Game Features:</h4>
                <ul>
                  <li>🗡️ Boss battles with 75% base success rate</li>
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
              <button className="switch-network-btn" onClick={() => open({ view: 'Networks' })}>
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
            
            <div className="game-section">
              <Leaderboard />
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>Powered by Monad Network ⚡</p>
      </footer>
    </div>
  )
}

export default App
