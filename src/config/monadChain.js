// Monad Network Configuration
export const monad = {
  id: 143,
  name: 'Monad',
  network: 'monad',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://monad-mainnet.infura.io'],
    },
    public: {
      http: ['https://monad-mainnet.infura.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://monad.socialscan.io',
    },
  },
  testnet: false,
}

