# 🚀 Deployment Guide - Monad Boss Game

This guide will walk you through deploying your smart contract to the Monad network and connecting it to the frontend.

## 📋 Prerequisites

- [x] Wallet with MON tokens (for gas fees on Monad)
- [x] Dynamic Environment ID configured
- [x] Node.js and npm installed

## Step 1: Install Dependencies

If you haven't already, install all dependencies:

```bash
npm install
```

This installs:
- Hardhat & toolbox (for smart contract development)
- Dynamic SDK (for wallet connectivity)
- All other frontend dependencies

## Step 2: Set Up Environment Variables

Create a `.env` file in the project root:

```env
# Dynamic Environment ID (from Dynamic dashboard)
VITE_DYNAMIC_ENVIRONMENT_ID=your_environment_id_here

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
- Connect to Monad RPC
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
2. Connect your wallet or create a new one
3. Make sure you're on Monad network (Chain ID: 143)
4. Click "Attack Boss"
5. Approve the transaction in your wallet
6. Wait for confirmation
7. See your loot in the inventory!

## 🎯 What You Can Do Now

### Kill Bosses
- Base 100% success rate
- Each item boosts your success rate
- Max success rate: 99%

### Collect Items
- 10 tiers: Grey → Rainbow
- Each tier has different rarity
- Items boost success & rarity rates

### Build Inventory
- Max 20 items
- Weakest items auto-replaced
- View item stats and counts

### Transfer Items
- Send items to other players
- Click on any item to open transfer modal

### Withdraw MON
- Click "Withdraw" button next to balance
- Enter destination address and amount
- Use MAX to send your full balance

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
- Click "Switch to Monad" button
- Or manually switch to Monad (Chain ID: 143) in your wallet

### Contract not responding
- Verify the contract address in `.env`
- Check Monad RPC is working
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
- `transferItem(to, itemId)` - Transfer item to another player

## 🎨 Customization Ideas

Now that your game is running, you can:

1. **Adjust Drop Rates:** Edit `BossFightGame.sol` tier probabilities
2. **Add More Tiers:** Extend the tier system beyond 10
3. **Custom Item Icons:** Replace emoji with actual images
4. **Leaderboards:** Track total boss kills per player
5. **Seasons:** Reset inventories periodically for fair competition

## 📚 Next Steps

- [ ] Add trading UI
- [ ] Implement leaderboards
- [ ] Create boss animations
- [ ] Add sound effects
- [ ] Build achievement system
- [ ] Deploy to production domain

---

**Need Help?**
- Check Hardhat docs: https://hardhat.org/docs
- Dynamic docs: https://docs.dynamic.xyz
- Monad docs: https://docs.monad.xyz

Happy gaming! 🎮⚡
