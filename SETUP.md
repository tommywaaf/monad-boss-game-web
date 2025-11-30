# 🎮 Monad Boss Game - Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install:
- `@dynamic-labs/sdk-react-core` - Dynamic wallet SDK
- `@dynamic-labs/ethereum` - Ethereum wallet connectors
- `viem` - Lightweight Ethereum library
- `hardhat` - Smart contract development

### 2. Get Dynamic Environment ID

1. Go to [Dynamic Dashboard](https://app.dynamic.xyz)
2. Sign up / Log in
3. Create a new project or use existing
4. Copy your Environment ID from the dashboard

### 3. Configure Environment

Create a `.env` file in the project root:

```env
# Dynamic Environment ID
VITE_DYNAMIC_ENVIRONMENT_ID=your_environment_id_here

# Contract address (after deployment)
VITE_CONTRACT_ADDRESS=

# Private key for deployment (never commit this!)
PRIVATE_KEY=
```

### 4. Run Development Server

```bash
npm run dev
```

## 🔌 What's Included

### Files Structure:

```
src/
├── config/
│   ├── monadChain.js          # Monad network config (Chain ID: 143)
│   └── gameContract.js        # Contract ABI & address
├── components/
│   ├── WalletConnect.jsx      # Wallet connection component
│   ├── BossFight.jsx          # Boss battle component
│   ├── Inventory.jsx          # Player inventory
│   ├── TransferModal.jsx      # Item transfer modal
│   └── WithdrawModal.jsx      # MON withdrawal modal
├── hooks/
│   └── useGameContract.js     # Game contract interactions
├── App.jsx                    # Main app component
└── main.jsx                   # Dynamic SDK provider setup
```

## 🎯 Features

✅ **Wallet Options:**
- Create embedded wallet (email/social login)
- Connect external wallets (MetaMask, WalletConnect, etc.)

✅ **Network Detection:**
- Automatically detects if user is on Monad network
- Shows visual indicator for correct/wrong network
- Easy network switching

✅ **Wallet Features:**
- View MON balance
- Withdraw MON to any address
- Copy wallet address
- Disconnect option

## 🌐 Monad Network Details

- **Chain ID:** 143
- **Network Name:** Monad
- **RPC URL:** https://rpc.monad.xyz
- **Symbol:** MON
- **Explorer:** https://explorer.monad.xyz

## 🧪 Testing

1. Open the app in your browser
2. Click "Connect Wallet" or "Create New Wallet"
3. Complete authentication (email, social, or external wallet)
4. If not on Monad network, click "Switch to Monad"
5. The app will show your connected address, balance, and network status

## 🚀 Next Steps

Now that wallet connection is working, you can:

1. **Deploy the Smart Contract:**
   - See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

2. **Play the Game:**
   - Attack bosses to earn items
   - Build your inventory
   - Transfer items to friends
   - Withdraw MON when needed

## 🐛 Troubleshooting

**Wallet not connecting?**
- Make sure Dynamic Environment ID is set in `.env`
- Check browser console for errors
- Try different authentication methods

**Wrong network showing?**
- Click "Switch to Monad" button
- Manually add Monad network to your wallet if needed
- RPC: https://rpc.monad.xyz
- Chain ID: 143

**Build errors?**
- Run `npm install` again
- Clear node_modules and reinstall
- Check for typos in configuration files

## 📖 Documentation Links

- [Dynamic Docs](https://docs.dynamic.xyz)
- [Viem Docs](https://viem.sh)
- [Hardhat Docs](https://hardhat.org/docs)

---

Happy building! 🎮⚡
