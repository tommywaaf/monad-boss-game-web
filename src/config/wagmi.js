import { createConfig, http } from 'wagmi'
import { defineChain } from 'viem'

// Define Monad chain
export const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.monad.xyz/'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://monad.socialscan.io',
    },
  },
})

// Create wagmi config for Monad
export const wagmiConfig = createConfig({
  chains: [monad],
  multiInjectedProviderDiscovery: false, // Dynamic handles this
  transports: {
    [monad.id]: http('https://rpc.monad.xyz/', {
      retryCount: 0, // Disable retries to prevent rate limit blocking
      timeout: 30000,
    }),
  },
})

