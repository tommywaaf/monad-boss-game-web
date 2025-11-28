# 🎮 Monad Boss Game

A decentralized boss-fighting game on the Monad blockchain. Fight bosses, collect rare items, and build the ultimate inventory!

## ✨ Features

- 🗡️ **Boss Battles** - 75% base success rate with item boosts
- 💎 **10 Item Tiers** - From Common to Rainbow with increasing rarity
- 📦 **Smart Inventory** - 20-item limit with automatic upgrades
- 📈 **Boost System** - Items increase success & rarity chances
- 🔄 **P2P Trading** - Trade items with other players
- 🌐 **Multi-Wallet Support** - MetaMask, WalletConnect, and more

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

Create a `.env` file:

```env
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
VITE_CONTRACT_ADDRESS=your_contract_address_here
PRIVATE_KEY=your_private_key_for_deployment
```

### 3. Compile & Deploy Contract

```bash
# Compile the smart contract
npm run compile

# Deploy to Monad network
npm run deploy
```

### 4. Run the Game

```bash
npm run dev
```

Open `http://localhost:5173` and start playing!

## 📖 Documentation

- **[SETUP.md](SETUP.md)** - Initial setup and wallet configuration
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Complete deployment walkthrough

## 🎯 How to Play

1. **Connect Wallet** - Use MetaMask or WalletConnect
2. **Switch to Monad** - Network Chain ID: 143
3. **Attack Boss** - Click the attack button
4. **Collect Items** - Build your inventory
5. **Get Stronger** - Items boost your success rate

## 🏗️ Tech Stack

- **Frontend:** React + Vite
- **Web3:** Wagmi + Viem + Web3Modal
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
│   │   └── Inventory.jsx
│   ├── config/             # Configuration files
│   │   ├── monadChain.js   # Monad network config
│   │   ├── wagmiConfig.js  # Wagmi setup
│   │   └── gameContract.js # Contract ABI & address
│   ├── hooks/              # Custom React hooks
│   │   └── useGameContract.js
│   └── App.jsx             # Main app component
├── hardhat.config.js       # Hardhat configuration
└── package.json
```

## 🎮 Game Mechanics

### Item Tiers & Rarity

| Tier | Name | Drop Rate | Rarity Boost | Success Boost |
|------|------|-----------|--------------|---------------|
| 0 | Common | 1:1 | +0% | +5% |
| 1 | Grey | 1:10 | +1% | +5% |
| 2 | White | 1:100 | +2% | +5% |
| 3 | Blue | 1:1,000 | +3% | +7% |
| 4 | Purple | 1:10,000 | +4% | +10% |
| 5 | Orange | 1:100,000 | +5% | +10% |
| 6 | Red | 1:1,000,000 | +10% | +10% |
| 7 | Brown | 1:10,000,000 | +15% | +10% |
| 8 | Black | 1:100,000,000 | +20% | +10% |
| 9 | Rainbow | 1:1,000,000,000 | +25% | +10% |

### Boss Fight System

- **Base Success Rate:** 75%
- **Max Success Rate:** 99%
- **Success boost:** Sum of all item success boosts
- **Rarity boost:** Chance to upgrade dropped item tier
- **Inventory:** Max 20 items, auto-replaces weakest

## 🔮 Future Features

- [ ] Trading UI implementation
- [ ] Leaderboards & rankings
- [ ] Multiple boss types
- [ ] Achievement system
- [ ] Token rewards
- [ ] Guild/team battles
- [ ] NFT marketplace integration

## 🛠️ Development

### Available Scripts

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run compile      # Compile smart contracts
npm run deploy       # Deploy to Monad
npm run lint         # Run ESLint
```

### Testing Locally

```bash
# Start local Hardhat node
npx hardhat node

# Deploy to local network
npm run deploy:local
```

## 🌐 Monad Network

- **Chain ID:** 143
- **RPC URL:** https://mainnet-rpc.monad.xyz
- **Block Explorer:** https://explorer.monad.xyz
- **Currency:** MON

## 📜 Smart Contract

The `BossFightGame` contract includes:

- **killBoss()** - Attack boss and earn items
- **getInventory(address)** - View player inventory
- **getTotalBoosts(address)** - Get player stat boosts
- **proposeTrade(...)** - Initiate item trade
- **acceptTrade(...)** - Accept pending trade

## 🤝 Contributing

Contributions welcome! Feel free to open issues or submit PRs.

## 📄 License

MIT

---

Built with ⚡ on [Monad](https://monad.xyz)
