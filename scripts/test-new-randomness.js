// Quick test of new randomness logic
// Run with: node scripts/test-new-randomness.js

const crypto = require('crypto');

function simulateKill(killNum, address, totalKills) {
  // Simulate double hash with all entropy sources
  const blockNum = 1000000 + killNum;
  const timestamp = Date.now() + killNum * 12000;
  const gasLimit = 30000000 + (killNum % 100000);
  const baseFee = 1000000000 + (killNum % 500000000);
  
  // First hash
  const hash1 = crypto.createHash('sha256')
    .update(`${blockNum}${timestamp}${address}${killNum}`)
    .digest('hex');
  
  // Second hash
  const hash2 = crypto.createHash('sha256')
    .update(`${hash1}${gasLimit}${baseFee}${address}${killNum}${totalKills}`)
    .digest('hex');
  
  // Convert to number and modulo
  const roll = BigInt('0x' + hash2) % 1000000000n;
  const rollNum = Number(roll);
  
  // Determine tier
  let tier;
  if (rollNum < 1) tier = 9;
  else if (rollNum < 10) tier = 8;
  else if (rollNum < 100) tier = 7;
  else if (rollNum < 1000) tier = 6;
  else if (rollNum < 10000) tier = 5;
  else if (rollNum < 100000) tier = 4;
  else if (rollNum < 1000000) tier = 3;
  else if (rollNum < 10000000) tier = 2;
  else if (rollNum < 100000000) tier = 1;
  else tier = 0;
  
  return { roll: rollNum, tier };
}

// Run 100 simulations
const tiers = ['Common', 'Grey', 'White', 'Blue', 'Purple', 'Orange', 'Red', 'Brown', 'Black', 'Rainbow'];
const counts = Array(10).fill(0);
const rolls = [];
const address = '0x1234567890123456789012345678901234567890';
let totalKills = 0;

for (let i = 1; i <= 100; i++) {
  totalKills++;
  const { roll, tier } = simulateKill(i, address, totalKills);
  counts[tier]++;
  rolls.push(roll);
}

console.log('🎮 100 Boss Kills Simulation Results\n');
console.log('Tier Distribution:');
for (let i = 9; i >= 0; i--) {
  console.log(`  Tier ${i} (${tiers[i]}): ${counts[i]} (${(counts[i]/100*100).toFixed(1)}%)`);
}

const avg = rolls.reduce((a,b) => a+b, 0) / 100;
const common = rolls.filter(r => r >= 100000000).length;
const grey = rolls.filter(r => r >= 10000000 && r < 100000000).length;

console.log(`\nAverage Roll: ${Math.floor(avg).toLocaleString()}`);
console.log(`Common (100M+): ${common} (${(common/100*100).toFixed(1)}%) - Expected: ~90%`);
console.log(`Grey (10M-99M): ${grey} (${(grey/100*100).toFixed(1)}%) - Expected: ~9%`);
console.log(`\nFirst 10 rolls: ${rolls.slice(0, 10).map(r => r.toLocaleString()).join(', ')}`);

