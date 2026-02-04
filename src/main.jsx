import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from './config/wagmi'
import './index.css'
import App from './App.jsx'
import Broadcaster from './pages/Broadcaster.jsx'
import Simulator from './pages/Simulator.jsx'

// Get Dynamic Environment ID from environment variable
const dynamicEnvironmentId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID

if (!dynamicEnvironmentId) {
  console.warn('VITE_DYNAMIC_ENVIRONMENT_ID is not set. Dynamic embedded wallets will not work.')
}

// Create React Query client
const queryClient = new QueryClient()

// Monad network configuration for Dynamic
// All required fields for custom EVM networks per Dynamic docs
const monadNetwork = {
  blockExplorerUrls: ['https://monad.socialscan.io'],
  chainId: 143,
  chainName: 'Monad Testnet', // Required for internal lookup
  name: 'Monad',
  vanityName: 'Monad',
  rpcUrls: ['https://rpc.monad.xyz/'],
  iconUrls: ['https://monad.socialscan.io/favicon-32x32.png'],
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18,
    iconUrl: 'https://monad.socialscan.io/favicon-32x32.png',
  },
  networkId: 143,
}

// Main app with all providers (wallet connection, etc.)
function MainApp() {
  if (!dynamicEnvironmentId) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        flexDirection: 'column',
        color: '#fff',
        background: '#0f0c29',
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <h1 style={{ color: '#f44336', marginBottom: '1rem' }}>⚠️ Configuration Required</h1>
        <p style={{ marginBottom: '0.5rem' }}>VITE_DYNAMIC_ENVIRONMENT_ID is not set.</p>
        <p style={{ marginBottom: '1rem', opacity: 0.8 }}>Please set this environment variable to use the app.</p>
        <div style={{ 
          background: '#1a1a2e', 
          padding: '1rem', 
          borderRadius: '8px',
          textAlign: 'left',
          maxWidth: '600px',
          marginTop: '1rem'
        }}>
          <p style={{ marginBottom: '0.5rem' }}><strong>To fix:</strong></p>
          <ol style={{ marginLeft: '1.5rem', lineHeight: '1.8' }}>
            <li>Create a <code style={{ background: '#2a2a3e', padding: '2px 6px', borderRadius: '4px' }}>.env</code> file in the project root</li>
            <li>Add: <code style={{ background: '#2a2a3e', padding: '2px 6px', borderRadius: '4px' }}>VITE_DYNAMIC_ENVIRONMENT_ID=your_environment_id</code></li>
            <li>Get your Environment ID from: <a href="https://app.dynamic.xyz/dashboard/developer/api" target="_blank" rel="noopener" style={{ color: '#667eea' }}>Dynamic Dashboard</a></li>
            <li>Restart the dev server</li>
          </ol>
        </div>
      </div>
    )
  }

  return (
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId,
        walletConnectors: [EthereumWalletConnectors],
        overrides: {
          // Only allow Monad network - ignore dashboard networks to prevent Wagmi mismatch
          // This ensures embedded wallets always use Monad and don't get stuck on other chains
          evmNetworks: () => [monadNetwork],
        },
        walletConnectPreferredChains: ['eip155:143'], // Prefer Monad for WalletConnect
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <DynamicWagmiConnector>
            <App />
          </DynamicWagmiConnector>
        </QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/broadcaster" element={<Broadcaster />} />
        <Route path="/simulator" element={<Simulator />} />
        <Route path="/*" element={<MainApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
