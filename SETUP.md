# 🎮 Monad Boss Game - Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install:
- `wagmi` - React hooks for Ethereum wallet interactions
- `viem` - Lightweight Ethereum library
- `@tanstack/react-query` - State management for wagmi
- `@web3modal/wagmi` - Beautiful wallet connection UI

### 2. Get WalletConnect Project ID

1. Go to [WalletConnect Cloud](https://cloud.walletconnect.com)
2. Sign up / Log in
3. Create a new project
4. Copy your Project ID

### 3. Configure Project ID

Open `src/config/wagmiConfig.js` and replace:

```javascript
const projectId = 'YOUR_WALLETCONNECT_PROJECT_ID'
```

With your actual project ID:

```javascript
const projectId = 'abc123...'
```

### 4. Run Development Server

```bash
npm run dev
```

## 🔌 What's Included

### Files Created:

```
src/
├── config/
│   ├── monadChain.js          # Monad network config (Chain ID: 143)
│   └── wagmiConfig.js         # Wagmi & Web3Modal setup
├── components/
│   ├── WalletConnect.jsx      # Wallet connection component
│   └── WalletConnect.css      # Wallet UI styles
├── App.jsx                    # Updated main app
├── App.css                    # Updated app styles
└── main.jsx                   # Providers wrapper
```

## 🎯 Features

✅ **Connect Wallets:**
- MetaMask
- WalletConnect (mobile wallets)
- Coinbase Wallet
- And more...

✅ **Network Detection:**
- Automatically detects if user is on Monad network
- Shows visual indicator for correct/wrong network
- Easy network switching

✅ **Wallet Info Display:**
- Connected address (truncated)
- Network status badge
- Disconnect option

## 🌐 Monad Network Details

- **Chain ID:** 143
- **Network Name:** Monad
- **RPC URL:** https://mainnet-rpc.monad.xyz
- **Symbol:** MON

## 🧪 Testing

1. Open the app in your browser
2. Click "Connect Wallet"
3. Select your wallet (MetaMask recommended for testing)
4. Approve the connection
5. If not on Monad network, click "Switch Network"
6. The app will show your connected address and network status

## 🚀 Next Steps

Now that wallet connection is working, you can:

1. **Add Smart Contract Integration:**
   - Create contract ABI files
   - Add contract addresses
   - Use wagmi hooks like `useReadContract` and `useWriteContract`

2. **Build Game Features:**
   - Boss battle mechanics
   - NFT minting
   - Token rewards
   - Leaderboards

3. **Enhance UI:**
   - Add game graphics
   - Create battle animations
   - Build inventory system

## 📚 Useful Hooks

When you're ready to integrate contracts:

```javascript
import { useReadContract, useWriteContract } from 'wagmi'

// Read from contract
const { data } = useReadContract({
  address: '0x...',
  abi: contractABI,
  functionName: 'getBossHealth',
})

// Write to contract
const { writeContract } = useWriteContract()

writeContract({
  address: '0x...',
  abi: contractABI,
  functionName: 'attackBoss',
  args: [damageAmount],
})
```

## 🐛 Troubleshooting

**Wallet not connecting?**
- Make sure you've installed dependencies
- Check that WalletConnect Project ID is set
- Try different wallet providers

**Wrong network showing?**
- Click "Switch Network" button
- Manually add Monad network to MetaMask if needed
- RPC: https://mainnet-rpc.monad.xyz
- Chain ID: 143

**Build errors?**
- Run `npm install` again
- Clear node_modules and reinstall
- Check for typos in configuration files

## 📖 Documentation Links

- [Wagmi Docs](https://wagmi.sh)
- [Web3Modal Docs](https://docs.walletconnect.com/web3modal/about)
- [Viem Docs](https://viem.sh)

---

Happy building! 🎮⚡

