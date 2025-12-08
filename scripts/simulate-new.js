// Simulate the new contract randomness logic
// Using crypto for hash simulation

function simulateBossKill(killNumber, playerAddress, totalBossesKilled) {
  // Simulate the double hashing with multiple entropy sources
  // We'll use a combination of factors to simulate the hash
  
  // Simulate block data
  const blockNumber = 1000000 + killNumber
  const blockTimestamp = Math.floor(Date.now() / 1000) + killNumber * 12 // ~12 sec per block
  const blockGasLimit = 30000000 + (killNumber % 100000)
  const blockBaseFee = 1000000000 + (killNumber % 500000000)
  
  // Simulate first hash round
  const hash1Input = `${blockNumber}-${blockTimestamp}-${playerAddress}-${killNumber}`
  const hash1 = hashString(hash1Input)
  
  // Simulate second hash round
  const hash2Input = `${hash1}-${blockGasLimit}-${blockBaseFee}-${playerAddress}-${killNumber}-${totalBossesKilled}`
  const hash2 = hashString(hash2Input)
  
  // Calculate base roll (modulo 1 billion)
  const baseRoll = hash2 % 1_000_000_000
  
  // Determine tier (matching contract logic exactly)
  let baseTier
  if (baseRoll < 1) baseTier = 9
  else if (baseRoll < 10) baseTier = 8
  else if (baseRoll < 100) baseTier = 7
  else if (baseRoll < 1_000) baseTier = 6
  else if (baseRoll < 10_000) baseTier = 5
  else if (baseRoll < 100_000) baseTier = 4
  else if (baseRoll < 1_000_000) baseTier = 3
  else if (baseRoll < 10_000_000) baseTier = 2
  else if (baseRoll < 100_000_000) baseTier = 1
  else baseTier = 0
  
  return { baseRoll, baseTier }
}

// Simple hash function to simulate keccak256 distribution
function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  // Make it larger and more random-like
  hash = Math.abs(hash)
  // Multiply by large primes and add more randomness
  hash = (hash * 2654435761) ^ (hash * 2246822507)
  hash = Math.abs(hash)
  // Scale to 256-bit range simulation
  return BigInt(hash) * BigInt(1000000000) + BigInt(Math.floor(Math.random() * 1000000000))
}

// Run simulation
const ITEM_TIERS = [
  { name: 'Common', color: '#888' },
  { name: 'Grey', color: '#999' },
  { name: 'White', color: '#fff' },
  { name: 'Blue', color: '#2196F3' },
  { name: 'Purple', color: '#9C27B0' },
  { name: 'Orange', color: '#FF9800' },
  { name: 'Red', color: '#F44336' },
  { name: 'Brown', color: '#795548' },
  { name: 'Black', color: '#000' },
  { name: 'Rainbow', color: 'linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)' }
]

console.log('🎮 Simulating 100 Boss Kills with New Logic')
console.log('============================================================\n')

const playerAddress = '0x1234567890123456789012345678901234567890'
let totalBossesKilled = 0
const results = {
  baseRolls: [],
  tierCounts: Array(10).fill(0),
  rollRanges: {
    common: 0,    // 100M-999M
    grey: 0,      // 10M-99M
    white: 0,     // 1M-9.9M
    blue: 0,      // 100K-999K
    other: 0
  }
}

for (let i = 1; i <= 100; i++) {
  totalBossesKilled++
  const { baseRoll, baseTier } = simulateBossKill(i, playerAddress, totalBossesKilled)
  const rollNum = Number(baseRoll)
  results.baseRolls.push(rollNum)
  results.tierCounts[baseTier]++
  
  // Track roll ranges
  if (rollNum >= 100_000_000) results.rollRanges.common++
  else if (rollNum >= 10_000_000) results.rollRanges.grey++
  else if (rollNum >= 1_000_000) results.rollRanges.white++
  else if (rollNum >= 100_000) results.rollRanges.blue++
  else results.rollRanges.other++
}

console.log('📊 BASE DROP STATISTICS:')
console.log('------------------------------------------------------------')
for (let i = 9; i >= 0; i--) {
  const count = results.tierCounts[i]
  const percent = (count / 100 * 100).toFixed(2)
  const bar = '█'.repeat(Math.floor(count / 2))
  console.log(`Tier ${i} (${ITEM_TIERS[i].name.padEnd(8)}): ${count.toString().padStart(3)} (${percent.padStart(6)}%) ${bar}`)
}

console.log('\n📈 ROLL DISTRIBUTION:')
console.log('------------------------------------------------------------')
const avgRoll = results.baseRolls.reduce((a, b) => a + b, 0) / 100
const minRoll = Math.min(...results.baseRolls)
const maxRoll = Math.max(...results.baseRolls)
const sortedRolls = [...results.baseRolls].sort((a, b) => a - b)
const medianRoll = sortedRolls[50]

console.log(`Average Roll: ${Math.floor(avgRoll).toLocaleString()}`)
console.log(`Expected Average: ~500,000,000`)
console.log(`Difference: ${Math.abs(Math.floor(avgRoll) - 500000000).toLocaleString()}`)
console.log(`Min Roll: ${minRoll.toLocaleString()}`)
console.log(`Max Roll: ${maxRoll.toLocaleString()}`)
console.log(`Median Roll: ${medianRoll.toLocaleString()}`)

console.log('\n🎯 ROLL RANGES:')
console.log('------------------------------------------------------------')
console.log(`Common (100M-999M): ${results.rollRanges.common} (${(results.rollRanges.common/100*100).toFixed(1)}%) - Expected: ~90%`)
console.log(`Grey   (10M-99M):   ${results.rollRanges.grey} (${(results.rollRanges.grey/100*100).toFixed(1)}%) - Expected: ~9%`)
console.log(`White  (1M-9.9M):   ${results.rollRanges.white} (${(results.rollRanges.white/100*100).toFixed(1)}%) - Expected: ~0.9%`)
console.log(`Blue   (100K-999K): ${results.rollRanges.blue} (${(results.rollRanges.blue/100*100).toFixed(1)}%) - Expected: ~0.09%`)
console.log(`Other  (<100K):     ${results.rollRanges.other} (${(results.rollRanges.other/100*100).toFixed(1)}%)`)

console.log('\n📋 SAMPLE ROLLS (first 15):')
console.log('------------------------------------------------------------')
results.baseRolls.slice(0, 15).forEach((roll, i) => {
  let tier
  let tierName
  if (roll >= 100_000_000) {
    tier = 0
    tierName = 'Common'
  } else if (roll >= 10_000_000) {
    tier = 1
    tierName = 'Grey'
  } else if (roll >= 1_000_000) {
    tier = 2
    tierName = 'White'
  } else if (roll >= 100_000) {
    tier = 3
    tierName = 'Blue'
  } else {
    tier = 'Other'
    tierName = 'Rare+'
  }
  console.log(`Kill ${(i + 1).toString().padStart(3)}: ${roll.toLocaleString().padStart(12)} → Tier ${tier} (${tierName})`)
})

// Check for clustering
const highRolls = results.baseRolls.filter(r => r >= 800_000_000).length
const lowRolls = results.baseRolls.filter(r => r < 100_000_000).length
console.log('\n🔍 DISTRIBUTION ANALYSIS:')
console.log('------------------------------------------------------------')
console.log(`Rolls >= 800M: ${highRolls} (${(highRolls/100*100).toFixed(1)}%) - Expected: ~20%`)
console.log(`Rolls < 100M:  ${lowRolls} (${(lowRolls/100*100).toFixed(1)}%) - Expected: ~10%`)
console.log(`Rolls 100M-500M: ${results.baseRolls.filter(r => r >= 100_000_000 && r < 500_000_000).length} (${(results.baseRolls.filter(r => r >= 100_000_000 && r < 500_000_000).length/100*100).toFixed(1)}%)`)
console.log(`Rolls 500M-999M: ${results.baseRolls.filter(r => r >= 500_000_000 && r < 1_000_000_000).length} (${(results.baseRolls.filter(r => r >= 500_000_000 && r < 1_000_000_000).length/100*100).toFixed(1)}%)`)

console.log('\n✅ Simulation Complete!')
console.log('============================================================')
