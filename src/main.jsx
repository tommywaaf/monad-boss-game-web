import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { reconnect } from '@wagmi/core'
import { config } from './config/wagmiConfig'
import './index.css'
import App from './App.jsx'

const queryClient = new QueryClient()

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
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ReconnectHandler />
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
