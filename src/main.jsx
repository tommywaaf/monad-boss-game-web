import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import './index.css'
import App from './App.jsx'

// Get Dynamic Environment ID from environment variable
const dynamicEnvironmentId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID

if (!dynamicEnvironmentId) {
  console.warn('VITE_DYNAMIC_ENVIRONMENT_ID is not set. Dynamic embedded wallets will not work.')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <App />
    </DynamicContextProvider>
  </StrictMode>,
)
