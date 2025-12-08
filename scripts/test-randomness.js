import hre from 'hardhat'

async function main() {
  const iterations = parseInt(process.argv[2]) || 1000
  console.log(`\n🎲 Testing randomness with ${iterations} iterations...\n`)

  const [signer] = await hre.ethers.getSigners()
  
  // Deploy fresh contract
  const BossFightGame = await hre.ethers.getContractFactory('BossFightGame')
  const game = await BossFightGame.deploy()
  await game.waitForDeployment()
  
  console.log(`Contract deployed to: ${await game.getAddress()}`)
  console.log(`Testing with account: ${signer.address}\n`)

  const tierCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const rollsBelowThreshold = {
    below100M: 0,
    below10M: 0,
    below1M: 0,
    below100K: 0,
    below10K: 0,
    below1K: 0,
    below100: 0,
    below10: 0,
    below1: 0
  }

  const rakeFee = await game.RAKE_FEE()
  
  for (let i = 0; i < iterations; i++) {
    const tx = await game.killBoss({ value: rakeFee })
    const receipt = await tx.wait()
    
    // Find BossKilled event
    const event = receipt.logs.find(log => {
      try {
        const parsed = game.interface.parseLog(log)
        return parsed?.name === 'BossKilled'
      } catch {
        return false
      }
    })
    
    if (event) {
      const parsed = game.interface.parseLog(event)
      const tier = Number(parsed.args.tier)
      const baseRoll = BigInt(parsed.args.baseRoll)
      
      tierCounts[tier]++
      
      if (baseRoll < 100_000_000n) rollsBelowThreshold.below100M++
      if (baseRoll < 10_000_000n) rollsBelowThreshold.below10M++
      if (baseRoll < 1_000_000n) rollsBelowThreshold.below1M++
      if (baseRoll < 100_000n) rollsBelowThreshold.below100K++
      if (baseRoll < 10_000n) rollsBelowThreshold.below10K++
      if (baseRoll < 1_000n) rollsBelowThreshold.below1K++
      if (baseRoll < 100n) rollsBelowThreshold.below100++
      if (baseRoll < 10n) rollsBelowThreshold.below10++
      if (baseRoll < 1n) rollsBelowThreshold.below1++
      
      if ((i + 1) % 100 === 0) {
        console.log(`Progress: ${i + 1}/${iterations} kills`)
      }
    }
  }

  console.log('\n📊 Results:\n')
  console.log('Tier Distribution:')
  const tierNames = ['Common', 'Grey', 'White', 'Blue', 'Purple', 'Orange', 'Red', 'Brown', 'Black', 'Rainbow']
  const expectedPcts = [90, 9, 0.9, 0.09, 0.009, 0.0009, 0.00009, 0.000009, 0.0000009, 0.0000000001]
  
  for (let i = 0; i < 10; i++) {
    const pct = ((tierCounts[i] / iterations) * 100).toFixed(4)
    const expected = expectedPcts[i]
    console.log(`  Tier ${i} (${tierNames[i]}): ${tierCounts[i]} (${pct}%) - expected ~${expected}%`)
  }

  console.log('\nRoll Distribution (baseRoll values):')
  console.log(`  < 100,000,000: ${rollsBelowThreshold.below100M} (${((rollsBelowThreshold.below100M / iterations) * 100).toFixed(2)}%) - expected ~10%`)
  console.log(`  < 10,000,000:  ${rollsBelowThreshold.below10M} (${((rollsBelowThreshold.below10M / iterations) * 100).toFixed(2)}%) - expected ~1%`)
  console.log(`  < 1,000,000:   ${rollsBelowThreshold.below1M} (${((rollsBelowThreshold.below1M / iterations) * 100).toFixed(2)}%) - expected ~0.1%`)
  console.log(`  < 100,000:     ${rollsBelowThreshold.below100K} (${((rollsBelowThreshold.below100K / iterations) * 100).toFixed(2)}%) - expected ~0.01%`)
  console.log(`  < 10,000:      ${rollsBelowThreshold.below10K} (${((rollsBelowThreshold.below10K / iterations) * 100).toFixed(2)}%) - expected ~0.001%`)

  const below100M = rollsBelowThreshold.below100M
  if (below100M === 0) {
    console.log('\n❌ WARNING: No rolls below 100,000,000 detected! Randomness may be broken.')
  } else {
    console.log(`\n✅ Randomness looks good! Got ${below100M} rolls below 100,000,000 (${((below100M/iterations)*100).toFixed(1)}%)`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

