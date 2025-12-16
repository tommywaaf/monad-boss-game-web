import { useState } from 'react'
import { 
  useDynamicContext, 
  useTokenBalances,
  useEmbeddedReveal,
  useUserWallets 
} from '@dynamic-labs/sdk-react-core'
import './AccountPanel.css'

// Format balance to readable string
const formatBalance = (balance, decimals = 18) => {
  if (!balance && balance !== 0) return '0.00'
  const num = typeof balance === 'number' ? balance : Number(balance)
  if (num < 0.0001 && num > 0) {
    return num.toExponential(2)
  }
  return num.toFixed(4)
}

// Format address for display
const formatAddress = (address) => {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function AccountPanel() {
  const { user, primaryWallet } = useDynamicContext()
  const userWallets = useUserWallets()
  const { tokenBalances, isLoading: isLoadingTokens, isError: isTokenError } = useTokenBalances()
  const { initExportProcess } = useEmbeddedReveal()
  
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  
  // Check if user has an embedded wallet
  const embeddedWallet = userWallets?.find(wallet => wallet.connector?.isEmbeddedWallet)
  const hasEmbeddedWallet = !!embeddedWallet
  
  // Get wallet type
  const getWalletType = () => {
    if (!primaryWallet) return 'Unknown'
    if (primaryWallet.connector?.isEmbeddedWallet) return 'Dynamic Embedded'
    return primaryWallet.connector?.name || 'External Wallet'
  }
  
  // Handle private key export
  const handleExportKey = async () => {
    if (!hasEmbeddedWallet) return
    
    setIsExporting(true)
    setExportError(null)
    
    try {
      await initExportProcess()
    } catch (error) {
      console.error('Export error:', error)
      setExportError(error.message || 'Failed to export private key')
    } finally {
      setIsExporting(false)
    }
  }
  
  // Copy address to clipboard
  const handleCopyAddress = async () => {
    if (!primaryWallet?.address) return
    
    try {
      await navigator.clipboard.writeText(primaryWallet.address)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }
  
  if (!primaryWallet) {
    return null
  }
  
  return (
    <div className="account-panel">
      <div className="account-panel-header">
        <h2>👤 Account</h2>
        <div className="account-tabs">
          <button 
            className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            Profile
          </button>
          <button 
            className={`tab-btn ${activeTab === 'balances' ? 'active' : ''}`}
            onClick={() => setActiveTab('balances')}
          >
            Balances
          </button>
          {hasEmbeddedWallet && (
            <button 
              className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              Security
            </button>
          )}
        </div>
      </div>
      
      <div className="account-panel-content">
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="profile-section">
            <div className="profile-avatar">
              {user?.email ? user.email[0].toUpperCase() : '👤'}
            </div>
            
            <div className="profile-info">
              {user?.email && (
                <div className="profile-row">
                  <span className="profile-label">📧 Email</span>
                  <span className="profile-value">{user.email}</span>
                </div>
              )}
              
              {user?.alias && (
                <div className="profile-row">
                  <span className="profile-label">🏷️ Alias</span>
                  <span className="profile-value">{user.alias}</span>
                </div>
              )}
              
              {user?.firstName && (
                <div className="profile-row">
                  <span className="profile-label">👋 Name</span>
                  <span className="profile-value">
                    {user.firstName} {user.lastName || ''}
                  </span>
                </div>
              )}
              
              <div className="profile-row">
                <span className="profile-label">💳 Wallet</span>
                <button 
                  className="address-copy-btn"
                  onClick={handleCopyAddress}
                  title="Click to copy full address"
                >
                  <span className="address-text">
                    {formatAddress(primaryWallet?.address)}
                  </span>
                  {copySuccess ? (
                    <span className="copy-icon success">✓</span>
                  ) : (
                    <span className="copy-icon">📋</span>
                  )}
                </button>
              </div>
              
              <div className="profile-row">
                <span className="profile-label">🔗 Type</span>
                <span className={`wallet-type-badge ${hasEmbeddedWallet ? 'embedded' : 'external'}`}>
                  {getWalletType()}
                </span>
              </div>
              
              {user?.userId && (
                <div className="profile-row">
                  <span className="profile-label">🆔 User ID</span>
                  <span className="profile-value user-id">{user.userId.slice(0, 8)}...</span>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Balances Tab */}
        {activeTab === 'balances' && (
          <div className="balances-section">
            {isLoadingTokens ? (
              <div className="balances-loading">
                <div className="loading-spinner"></div>
                <p>Loading token balances...</p>
              </div>
            ) : isTokenError ? (
              <div className="balances-error">
                <p>⚠️ Unable to load token balances</p>
                <p className="error-hint">This may be due to network limitations on Monad testnet</p>
              </div>
            ) : tokenBalances && tokenBalances.length > 0 ? (
              <div className="token-list">
                {tokenBalances.map((token, index) => (
                  <div key={token.address || index} className="token-item">
                    <div className="token-icon">
                      {token.logoURI ? (
                        <img 
                          src={token.logoURI} 
                          alt={token.symbol} 
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      ) : (
                        <span className="token-placeholder">💰</span>
                      )}
                    </div>
                    <div className="token-info">
                      <span className="token-name">{token.name || 'Unknown Token'}</span>
                      <span className="token-symbol">{token.symbol || '???'}</span>
                    </div>
                    <div className="token-balance">
                      <span className="balance-amount">
                        {formatBalance(token.balance, token.decimals)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="balances-empty">
                <span className="empty-icon">📭</span>
                <p>No tokens found</p>
                <p className="empty-hint">
                  Token balances may not be available on Monad testnet yet.
                  Your MON balance is shown in the widget above.
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* Security Tab (only for embedded wallets) */}
        {activeTab === 'security' && hasEmbeddedWallet && (
          <div className="security-section">
            <div className="security-card">
              <div className="security-icon">🔑</div>
              <h3>Export Private Key</h3>
              <p className="security-description">
                Export your embedded wallet's private key to back it up or use it in another wallet.
                <strong> Keep this key safe and never share it with anyone!</strong>
              </p>
              
              {exportError && (
                <div className="export-error">
                  ⚠️ {exportError}
                </div>
              )}
              
              <button 
                className="export-key-btn"
                onClick={handleExportKey}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <span className="btn-spinner"></span>
                    Preparing Export...
                  </>
                ) : (
                  <>
                    🔐 Export Private Key
                  </>
                )}
              </button>
              
              <div className="security-warning">
                <span className="warning-icon">⚠️</span>
                <div className="warning-text">
                  <strong>Warning:</strong> Anyone with your private key has full control of your wallet.
                  Store it securely offline.
                </div>
              </div>
            </div>
            
            <div className="security-info">
              <h4>🛡️ About Your Embedded Wallet</h4>
              <ul>
                <li>Your wallet is secured with MPC (Multi-Party Computation)</li>
                <li>Your key is split between your device and Dynamic's servers</li>
                <li>Neither party can access funds alone</li>
                <li>Export creates a full backup you control</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AccountPanel

