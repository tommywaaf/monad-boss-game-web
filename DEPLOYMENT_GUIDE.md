# 🚀 Deployment Guide - Monad Boss Game

This guide will walk you through deploying your smart contract to the Monad network and connecting it to the frontend.

## 📋 Prerequisites

- [x] Wallet with MON tokens (for gas fees on Monad)
- [x] WalletConnect Project ID configured
- [x] Node.js and npm installed

## Step 1: Install Dependencies

If you haven't already, install all dependencies:

```bash
npm install
```

This installs:
- Hardhat & toolbox (for smart contract development)
- Wagmi & Web3Modal (for wallet connectivity)
- All other frontend dependencies

## Step 2: Set Up Environment Variables

Create a `.env` file in the project root:

```bash
# Copy the example
cp .env.example .env
```

Edit `.env` and add:

```env
# WalletConnect Project ID (you already have this)
VITE_WALLETCONNECT_PROJECT_ID=563c100c26ea5e8412df52383cde520a

# Your wallet's private key for deployment
# ⚠️ NEVER commit this file! It's in .gitignore
PRIVATE_KEY=your_private_key_here

# Contract address (will be filled after deployment)
VITE_CONTRACT_ADDRESS=
```

### 🔑 Getting Your Private Key:

**MetaMask:**
1. Open MetaMask
2. Click the three dots → Account Details
3. Export Private Key
4. Enter password
5. Copy the private key

**⚠️ SECURITY WARNING:**
- NEVER share your private key
- NEVER commit `.env` to git
- Use a test wallet for development
- The `.env` file is already in `.gitignore`

## Step 3: Compile the Smart Contract

```bash
npm run compile
```

This will:
- Compile `contracts/BossFightGame.sol`
- Generate ABI and bytecode in `artifacts/`
- Check for any compilation errors

Expected output:
```
Compiled 1 Solidity file successfully
```

## Step 4: Get MON Tokens

You need MON tokens to pay for deployment gas fees.

1. Make sure your wallet is connected to Monad network
2. Get tokens from a faucet or bridge
3. Verify you have enough for deployment (~0.05 MON should be plenty)

## Step 5: Deploy to Monad

Deploy the contract:

```bash
npm run deploy
```

This will:
- Connect to Monad RPC: `https://mainnet-rpc.monad.xyz`
- Deploy the `BossFightGame` contract
- Output the contract address

Expected output:
```
Deploying BossFightGame to Monad...
✅ BossFightGame deployed to: 0x1234567890abcdef...

Add this to your .env file:
VITE_CONTRACT_ADDRESS=0x1234567890abcdef...
```

## Step 6: Update Environment Variables

Copy the contract address from the deployment output and add it to `.env`:

```env
VITE_CONTRACT_ADDRESS=0x1234567890abcdef...
```

## Step 7: Restart Development Server

If your dev server is running, restart it to pick up the new environment variable:

```bash
# Stop the server (Ctrl+C)
# Start again
npm run dev
```

## Step 8: Test the Game! 🎮

1. Open `http://localhost:5173`
2. Connect your wallet
3. Make sure you're on Monad network (Chain ID: 143)
4. Click "Attack Boss"
5. Approve the transaction in your wallet
6. Wait for confirmation
7. See your loot in the inventory!

## 🎯 What You Can Do Now

### Kill Bosses
- Base 75% success rate
- Each item boosts your success rate
- Max success rate: 99%

### Collect Items
- 10 tiers: Common → Rainbow
- Each tier has different rarity
- Items boost success & rarity rates

### Build Inventory
- Max 20 items
- Weakest items auto-replaced
- View item stats and counts

### Trade (Coming Soon)
- The contract has trading functions ready
- UI will be added in future updates

## 🔧 Troubleshooting

### "Insufficient funds" error
- Make sure you have MON tokens in your wallet
- Check that you're on the right network

### "Contract not deployed" message
- Verify `VITE_CONTRACT_ADDRESS` is set in `.env`
- Restart the dev server after changing `.env`
- Make sure the address is correct (starts with 0x)

### Transaction failing
- Check you have enough MON for gas
- Try increasing gas limit
- Make sure contract is properly deployed

### "Wrong Network" warning
- Click "Switch Network" button
- Or manually switch to Monad (Chain ID: 143) in your wallet

### Contract not responding
- Verify the contract address in `.env`
- Check Monad RPC is working: https://mainnet-rpc.monad.xyz
- Look for transaction on Monad explorer

## 📊 Contract Functions

The `BossFightGame` contract includes:

### Read Functions (Free)
- `getInventory(address)` - Get player's items
- `getTotalBoosts(address)` - Get player's boosts
- `itemOwner(itemId)` - Get item owner
- `MAX_INVENTORY` - View max inventory size (20)

### Write Functions (Costs Gas)
- `killBoss()` - Attack boss, get loot
- `proposeTrade(to, myItemId, theirItemId)` - Propose item trade
- `acceptTrade(tradeId)` - Accept a trade offer
- `cancelTrade(tradeId)` - Cancel your trade offer

## 🎨 Customization Ideas

Now that your game is running, you can:

1. **Adjust Drop Rates:** Edit `BossFightGame.sol` tier probabilities
2. **Add More Tiers:** Extend the tier system beyond 10
3. **Custom Item Icons:** Replace 💎 emoji with actual images
4. **Leaderboards:** Track total boss kills per player
5. **Seasons:** Reset inventories periodically for fair competition
6. **Staking:** Add token rewards for boss kills
7. **Boss Variety:** Multiple bosses with different difficulties
8. **Guilds:** Team-based gameplay

## 📚 Next Steps

- [ ] Add trading UI
- [ ] Implement leaderboards
- [ ] Create boss animations
- [ ] Add sound effects
- [ ] Build achievement system
- [ ] Deploy to production domain
- [ ] Add analytics/tracking

---

**Need Help?**
- Check Hardhat docs: https://hardhat.org/docs
- Wagmi docs: https://wagmi.sh
- Monad docs: https://docs.monad.xyz

Happy gaming! 🎮⚡

