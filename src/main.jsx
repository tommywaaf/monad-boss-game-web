import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { reconnect } from '@wagmi/core'
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector'
import { config } from './config/wagmiConfig'
import './index.css'
import App from './App.jsx'

const queryClient = new QueryClient()

// Get Dynamic Environment ID from environment variable
const dynamicEnvironmentId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID

if (!dynamicEnvironmentId) {
  console.warn('VITE_DYNAMIC_ENVIRONMENT_ID is not set. Dynamic embedded wallets will not work.')
}

// Component to handle reconnection after provider mounts
function ReconnectHandler() {
  useEffect(() => {
    // Reconnect after component mounts (provider is ready)
    reconnect(config).catch((error) => {
      // Silently handle reconnection errors (user might not have connected before)
      console.debug('Reconnection attempt:', error)
    })
  }, [])
  return null
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <DynamicWagmiConnector>
            <ReconnectHandler />
            <App />
          </DynamicWagmiConnector>
        </QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
  </StrictMode>,
)
