// Simulate 10,000 boss kills to test drop rates and inventory management
import crypto from 'crypto';

const TIER_NAMES = ['Common', 'Grey', 'White', 'Blue', 'Purple', 'Orange', 'Red', 'Brown', 'Black', 'Rainbow'];

// Exact logic from contract
function rollBaseTier(rand) {
  const r = rand % 1_000_000_000n;
  
  if (r < 1n) return 9;                           // Rainbow
  if (r < 1_000_000_000n / 100_000_000n) return 8; // Black
  if (r < 1_000_000_000n / 10_000_000n) return 7;  // Brown
  if (r < 1_000_000_000n / 1_000_000n) return 6;   // Red
  if (r < 1_000_000_000n / 100_000n) return 5;     // Orange
  if (r < 1_000_000_000n / 10_000n) return 4;      // Purple
  if (r < 1_000_000_000n / 1_000n) return 3;       // Blue
  if (r < 1_000_000_000n / 100n) return 2;         // White
  if (r < 1_000_000_000n / 10n) return 1;          // Grey
  
  return 0; // Common
}

// Calculate rarity boost from inventory
function getTotalRarityBoost(inventory) {
  const rarityBoosts = [0, 100, 200, 300, 400, 500, 1000, 1500, 2000, 2500];
  let total = 0;
  for (const item of inventory) {
    total += rarityBoosts[item.tier];
  }
  return total;
}

// Apply rarity upgrade
function applyRarityUpgrade(baseTier, inventory, rand) {
  const rarityBoost = getTotalRarityBoost(inventory);
  if (baseTier >= 9 || rarityBoost === 0) {
    return baseTier;
  }
  
  const r = rand % 10000n;
  if (r < BigInt(rarityBoost)) {
    return baseTier + 1; // Upgrade one tier
  }
  
  return baseTier;
}

// Add item to inventory (max 20, replace weakest)
function addItemToInventory(inventory, tier) {
  const newItem = { tier, id: inventory.length + 1 };
  
  if (inventory.length < 20) {
    inventory.push(newItem);
    return;
  }
  
  // Find weakest
  let weakestIndex = 0;
  let weakestTier = inventory[0].tier;
  
  for (let i = 1; i < inventory.length; i++) {
    if (inventory[i].tier < weakestTier) {
      weakestTier = inventory[i].tier;
      weakestIndex = i;
    }
  }
  
  // Replace if better
  if (tier > weakestTier) {
    inventory[weakestIndex] = newItem;
  }
}

// Pseudo-random generator (simpler than blockchain)
function getRandomBigInt(seed) {
  const hex = crypto.createHash('sha256').update(seed.toString()).digest('hex');
  return BigInt('0x' + hex);
}

// Run simulation
function simulate(numKills) {
  console.log(`\n🎮 Simulating ${numKills.toLocaleString()} Boss Kills\n`);
  console.log('=' .repeat(60));
  
  const inventory = [];
  const dropCounts = Array(10).fill(0);
  const baseDropCounts = Array(10).fill(0);
  let upgradeCount = 0;
  
  for (let i = 0; i < numKills; i++) {
    const rand = getRandomBigInt(i);
    
    // Roll base tier
    const baseTier = rollBaseTier(rand);
    baseDropCounts[baseTier]++;
    
    // Apply rarity upgrade
    const finalTier = applyRarityUpgrade(baseTier, inventory, rand >> 64n);
    dropCounts[finalTier]++;
    
    if (finalTier > baseTier) {
      upgradeCount++;
    }
    
    // Add to inventory
    addItemToInventory(inventory, finalTier);
  }
  
  // Results
  console.log('\n📊 BASE DROP STATISTICS (Before Rarity Boost):');
  console.log('-'.repeat(60));
  for (let tier = 9; tier >= 0; tier--) {
    const count = baseDropCounts[tier];
    const percent = ((count / numKills) * 100).toFixed(4);
    const bar = '█'.repeat(Math.floor(percent * 2));
    console.log(`Tier ${tier} (${TIER_NAMES[tier].padEnd(8)}): ${count.toString().padStart(6)} (${percent.padStart(7)}%) ${bar}`);
  }
  
  console.log('\n✨ FINAL DROP STATISTICS (After Rarity Boost):');
  console.log('-'.repeat(60));
  for (let tier = 9; tier >= 0; tier--) {
    const count = dropCounts[tier];
    const percent = ((count / numKills) * 100).toFixed(4);
    const bar = '█'.repeat(Math.floor(percent * 2));
    console.log(`Tier ${tier} (${TIER_NAMES[tier].padEnd(8)}): ${count.toString().padStart(6)} (${percent.padStart(7)}%) ${bar}`);
  }
  
  console.log(`\n🔼 Total Rarity Upgrades: ${upgradeCount} (${((upgradeCount/numKills)*100).toFixed(2)}%)`);
  
  console.log('\n🎒 FINAL INVENTORY (20 items):');
  console.log('-'.repeat(60));
  
  // Sort inventory by tier
  inventory.sort((a, b) => b.tier - a.tier);
  
  // Count by tier
  const invCounts = Array(10).fill(0);
  for (const item of inventory) {
    invCounts[item.tier]++;
  }
  
  for (let tier = 9; tier >= 0; tier--) {
    const count = invCounts[tier];
    if (count > 0) {
      console.log(`Tier ${tier} (${TIER_NAMES[tier].padEnd(8)}): ${count} items`);
    }
  }
  
  console.log('\n📈 INVENTORY STATS:');
  console.log('-'.repeat(60));
  const avgTier = inventory.reduce((sum, item) => sum + item.tier, 0) / inventory.length;
  const minTier = Math.min(...inventory.map(i => i.tier));
  const maxTier = Math.max(...inventory.map(i => i.tier));
  const totalRarityBoost = getTotalRarityBoost(inventory) / 100;
  
  console.log(`Average Tier: ${avgTier.toFixed(2)}`);
  console.log(`Tier Range: ${minTier} - ${maxTier}`);
  console.log(`Total Rarity Boost: +${totalRarityBoost}%`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Simulation Complete!\n');
}

// Run with command line arg or default to 10000
const numKills = parseInt(process.argv[2]) || 10000;
simulate(numKills);

