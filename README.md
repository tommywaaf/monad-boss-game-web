# 🎮 Monad Boss Game

A decentralized boss-fighting game on the Monad blockchain. Fight bosses, collect rare items, and build the ultimate inventory!

## ✨ Features

- 🗡️ **Boss Battles** - Fight bosses to earn loot
- 💎 **10 Item Tiers** - From Grey to Rainbow with increasing rarity
- 📦 **Smart Inventory** - 20-item limit with automatic upgrades
- 📈 **Boost System** - Items increase your rarity chances
- 🔄 **Item Transfers** - Transfer items to other players
- 💸 **Withdraw MON** - Send your MON to any wallet
- 🌐 **Dynamic Wallet Support** - Embedded wallets, social login, and external wallets

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

Create a `.env` file:

```env
# Dynamic Environment ID (from Dynamic dashboard)
VITE_DYNAMIC_ENVIRONMENT_ID=your_environment_id_here

# Contract address - use this sample or deploy your own
VITE_CONTRACT_ADDRESS=0xc7a4F99Dad829Dc9D8FD77D5bbb4C1387B908E79

# Private key for deployment (only needed if deploying your own contract)
PRIVATE_KEY=your_private_key_for_deployment
```

### 3. Compile & Deploy Contract (Optional)

You can skip this step and use the sample contract address above, or deploy your own:

```bash
# Compile the smart contract
npm run compile

# Deploy to Monad network
npm run deploy
```

### 4. Run the Game!

```bash
npm run dev
```

Open `http://localhost:5173` and start playing!

## 📖 Documentation

- **[SETUP.md](SETUP.md)** - Initial setup and wallet configuration
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Complete deployment walkthrough

## 🎯 How to Play

1. **Connect Wallet** - Use Dynamic to connect or create a wallet
2. **Switch to Monad** - Network Chain ID: 143
3. **Attack Boss** - Click the attack button
4. **Collect Items** - Build your inventory
5. **Get Stronger** - Items boost your rarity chances

## 🏗️ Tech Stack

- **Frontend:** React + Vite
- **Web3:** Dynamic SDK + Viem
- **Smart Contracts:** Solidity 0.8.24 + Hardhat
- **Blockchain:** Monad (Chain ID: 143)

## 📂 Project Structure

```
monad-boss-game-web/
├── contracts/              # Smart contracts
│   └── BossFightGame.sol   # Main game contract
├── scripts/                # Deployment scripts
│   └── deploy.js
├── src/
│   ├── components/         # React components
│   │   ├── WalletConnect.jsx
│   │   ├── BossFight.jsx
│   │   ├── Inventory.jsx
│   │   ├── TransferModal.jsx
│   │   └── WithdrawModal.jsx
│   ├── config/             # Configuration files
│   │   ├── monadChain.js   # Monad network config
│   │   └── gameContract.js # Contract ABI & address
│   ├── hooks/              # Custom React hooks
│   │   └── useGameContract.js
│   └── App.jsx             # Main app component
├── hardhat.config.js       # Hardhat configuration
└── package.json
```

## 🎮 Game Mechanics

### Item Tiers & Rarity

| Tier | Name | Drop Rate | Rarity Boost |
|------|------|-----------|--------------|
| 0 | Grey | 1:1 | +0% |
| 1 | Common | 1:10 | +1% |
| 2 | White | 1:100 | +2% |
| 3 | Blue | 1:1,000 | +3% |
| 4 | Purple | 1:10,000 | +4% |
| 5 | Orange | 1:100,000 | +5% |
| 6 | Red | 1:1,000,000 | +10% |
| 7 | Brown | 1:10,000,000 | +15% |
| 8 | Black | 1:100,000,000 | +20% |
| 9 | Rainbow | 1:1,000,000,000 | +25% |

### Boss Fight System

- **Rarity boost:** Items improve your chance at better item tiers
- **Inventory:** Max 20 items, auto-replaces weakest

## 🛠️ Development

### Available Scripts

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run compile      # Compile smart contracts
npm run deploy       # Deploy to Monad
npm run lint         # Run ESLint
```

### Contract Verification

To verify your contract on the Monad block explorer, update the contract address in `scripts/verify.js` and run:

```bash
npm run verify
```

## 🌐 Monad Network

- **Chain ID:** 143
- **RPC URL:** https://rpc.monad.xyz
- **Block Explorer:** https://monad.socialscan.io
- **Currency:** MON

## 📜 Smart Contract

The `BossFightGame` contract includes:

- **killBoss()** - Attack boss and earn items
- **getInventory(address)** - View player inventory
- **getTotalBoosts(address)** - Get player stat boosts
- **transferItem(to, itemId)** - Transfer an item to another player

## 🤝 Contributing

Contributions welcome! Feel free to open issues or submit PRs.

## 📄 License

MIT

---

Built with ⚡ on [Monad](https://monad.xyz)

<!-- push test -->
