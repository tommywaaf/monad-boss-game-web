// Test script to check randomness distribution
// Simulates the current contract logic

function simulateCurrentLogic(iterations = 10000) {
  const results = {
    0: 0, // Common
    1: 0, // Grey
    2: 0, // White
    3: 0, // Blue
    4: 0, // Purple
    5: 0, // Orange
    6: 0, // Red
    7: 0, // Brown
    8: 0, // Black
    9: 0, // Rainbow
  };

  // Simulate the current extraction logic
  for (let i = 0; i < iterations; i++) {
    // Simulate multiple hash rounds (simplified)
    const rand = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    
    // Simulate the bit extraction: (hashValue >> 184) & 0xFFFFFFFFFFFFFFFFFFFF
    // This extracts bits 184-255 (top 9 bytes)
    // In JavaScript, we'll simulate by taking high bits
    const hashValue = BigInt(rand) * BigInt(2**100) + BigInt(Math.floor(Math.random() * 2**100));
    const extractedBits = Number((hashValue >> 184n) & 0xFFFFFFFFFFFFFFFFFFFFn);
    const baseRoll = extractedBits % 1_000_000_000;
    
    // Apply tier logic
    let tier = 0;
    if (baseRoll < 1) tier = 9;
    else if (baseRoll < 10) tier = 8;
    else if (baseRoll < 100) tier = 7;
    else if (baseRoll < 1_000) tier = 6;
    else if (baseRoll < 10_000) tier = 5;
    else if (baseRoll < 100_000) tier = 4;
    else if (baseRoll < 1_000_000) tier = 3;
    else if (baseRoll < 10_000_000) tier = 2;
    else if (baseRoll < 100_000_000) tier = 1;
    else tier = 0;
    
    results[tier]++;
  }

  console.log('📊 Simulated Distribution (Current Logic):');
  console.log('='.repeat(60));
  const expected = {
    0: 0.90,  // 90% Common
    1: 0.09,  // 9% Grey (90M out of 1B)
    2: 0.009, // 0.9% White
    3: 0.0009, // 0.09% Blue
    4: 0.00009, // 0.009% Purple
    5: 0.000009, // 0.0009% Orange
    6: 0.0000009, // 0.00009% Red
    7: 0.00000009, // 0.000009% Brown
    8: 0.000000009, // 0.0000009% Black
    9: 0.000000001, // 0.0000001% Rainbow
  };

  for (let tier = 9; tier >= 0; tier--) {
    const count = results[tier];
    const percent = (count / iterations * 100).toFixed(4);
    const expectedPercent = (expected[tier] * 100).toFixed(4);
    const diff = (percent - expectedPercent).toFixed(4);
    const bar = '█'.repeat(Math.floor(count / iterations * 50));
    console.log(`Tier ${tier}: ${count.toString().padStart(6)} (${percent.padStart(8)}%) Expected: ${expectedPercent}% Diff: ${diff}% ${bar}`);
  }
  
  // Check Grey specifically
  const greyCount = results[1];
  const greyPercent = (greyCount / iterations * 100).toFixed(4);
  console.log('');
  console.log(`🎯 Grey (Tier 1) Analysis:`);
  console.log(`   Found: ${greyCount} (${greyPercent}%)`);
  console.log(`   Expected: ${(iterations * 0.09).toFixed(0)} (9.00%)`);
  console.log(`   In 53 kills, expected: ${(53 * 0.09).toFixed(1)} Grey items`);
  console.log(`   Getting only 1 in 53 has ~${((0.09**1 * 0.91**52 * 53) * 100).toFixed(2)}% probability`);
}

simulateCurrentLogic(100000);

