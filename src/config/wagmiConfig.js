import { createWeb3Modal } from '@web3modal/wagmi/react'
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config'
import { reconnect } from '@wagmi/core'
import { monad } from './monadChain'

// 1. Get projectId from https://cloud.walletconnect.com
// For testing, you can use a temporary one, but get your own for production
const projectId = '563c100c26ea5e8412df52383cde520a'

// 2. Create wagmiConfig
const metadata = {
    name: 'Monad Boss Game',
    description: 'Crypto Boss Game on Monad Network',
    url: 'https://killhitstudios.com',
    icons: ['https://killhitstudios.com/icon.png'],
  }

const chains = [monad]

export const config = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
})

// 3. Create Web3Modal
createWeb3Modal({
  wagmiConfig: config,
  projectId,
  enableAnalytics: false, // Optional - enable analytics
  enableOnramp: false // Optional - enable on-ramp
})

