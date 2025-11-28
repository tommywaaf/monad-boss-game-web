// Contract ABI - will be auto-generated after compilation
// For now, including the minimal ABI needed for our functions

export const GAME_CONTRACT_ABI = [
  {
    "inputs": [],
    "name": "killBoss",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "player", "type": "address"}],
    "name": "getInventory",
    "outputs": [
      {
        "components": [
          {"internalType": "uint8", "name": "tier", "type": "uint8"},
          {"internalType": "uint256", "name": "id", "type": "uint256"}
        ],
        "internalType": "struct BossFightGame.Item[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "player", "type": "address"}],
    "name": "getTotalBoosts",
    "outputs": [
      {"internalType": "uint16", "name": "rarityBpsTotal", "type": "uint16"},
      {"internalType": "uint16", "name": "successBpsTotal", "type": "uint16"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_INVENTORY",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "RAKE_FEE",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "RAKE_ADDRESS",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalBossesKilled",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getPlayerCount",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "index", "type": "uint256"}],
    "name": "getPlayerAt",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "player", "type": "address"}],
    "name": "getPlayerStats",
    "outputs": [
      {"internalType": "uint16", "name": "rarityBoost", "type": "uint16"},
      {"internalType": "uint16", "name": "successBoost", "type": "uint16"},
      {"internalType": "uint256", "name": "bossKills", "type": "uint256"},
      {"internalType": "uint256", "name": "inventorySize", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "player", "type": "address"}],
    "name": "playerBossKills",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "player", "type": "address"},
      {"indexed": false, "internalType": "uint8", "name": "tier", "type": "uint8"},
      {"indexed": false, "internalType": "uint256", "name": "itemId", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "baseRoll", "type": "uint256"},
      {"indexed": false, "internalType": "uint8", "name": "baseTier", "type": "uint8"},
      {"indexed": false, "internalType": "bool", "name": "upgraded", "type": "bool"}
    ],
    "name": "BossKilled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "player", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "RakePaid",
    "type": "event"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "to", "type": "address"},
      {"internalType": "uint256", "name": "myItemId", "type": "uint256"},
      {"internalType": "uint256", "name": "theirItemId", "type": "uint256"}
    ],
    "name": "proposeTrade",
    "outputs": [{"internalType": "uint256", "name": "tradeId", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "tradeId", "type": "uint256"}],
    "name": "acceptTrade",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "to", "type": "address"},
      {"internalType": "uint256", "name": "itemId", "type": "uint256"}
    ],
    "name": "transferItem",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "from", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "to", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "itemId", "type": "uint256"},
      {"indexed": false, "internalType": "uint8", "name": "tier", "type": "uint8"}
    ],
    "name": "ItemTransferred",
    "type": "event"
  }
]

// Contract address - set this after deployment
export const GAME_CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000'

// Tier names and colors
export const ITEM_TIERS = [
  { name: 'Common', color: '#9E9E9E', rarity: '1:1' },
  { name: 'Grey', color: '#757575', rarity: '1:10' },
  { name: 'White', color: '#FFFFFF', rarity: '1:100' },
  { name: 'Blue', color: '#2196F3', rarity: '1:1K' },
  { name: 'Purple', color: '#9C27B0', rarity: '1:10K' },
  { name: 'Orange', color: '#FF9800', rarity: '1:100K' },
  { name: 'Red', color: '#F44336', rarity: '1:1M' },
  { name: 'Brown', color: '#795548', rarity: '1:10M' },
  { name: 'Black', color: '#212121', rarity: '1:100M' },
  { name: 'Rainbow', color: 'linear-gradient(90deg, #FF0000, #FF7F00, #FFFF00, #00FF00, #0000FF, #4B0082, #9400D3)', rarity: '1:1B' }
]

