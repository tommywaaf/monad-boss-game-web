import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the compiled contract artifact
const artifactPath = join(__dirname, '../artifacts/contracts/BossFightGame.sol/BossFightGame.json');
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));

// Try to read build info for exact compiler version
let exactCompilerVersion = '0.8.24';
let compilerLongVersion = '0.8.24+commit.e11b9ed9';

try {
  const buildInfoPath = join(__dirname, '../artifacts/build-info/c3d5d42e0e570691470e1370f7046c5a.json');
  const buildInfo = JSON.parse(readFileSync(buildInfoPath, 'utf8'));
  exactCompilerVersion = buildInfo.solcVersion || exactCompilerVersion;
  compilerLongVersion = buildInfo.solcLongVersion || compilerLongVersion;
} catch (e) {
  // Use defaults if build info not found
}

console.log('📋 Contract Information');
console.log('='.repeat(60));
console.log('');
console.log('📝 Contract Name: BossFightGame');
console.log('');
console.log('⚙️  Compiler Settings:');
console.log(`   • Solidity Version: ${exactCompilerVersion}`);
console.log(`   • Full Compiler Version: ${compilerLongVersion}`);
console.log('   • Optimizer: Enabled');
console.log('   • Optimizer Runs: 200');
console.log('   • Via IR: true');
console.log('');
console.log('📦 Bytecode (for contract verification):');
console.log('-'.repeat(60));
console.log(artifact.bytecode);
console.log('-'.repeat(60));
console.log('');
console.log('📦 Deployed Bytecode (runtime bytecode):');
console.log('-'.repeat(60));
console.log(artifact.deployedBytecode);
console.log('-'.repeat(60));
console.log('');
console.log('💡 For contract verification on block explorers:');
console.log('   • Use the "bytecode" field above');
console.log(`   • Compiler version: ${compilerLongVersion}`);
console.log('   • Optimization: Enabled with 200 runs');
console.log('   • Via IR: true');
console.log('');
console.log('⚠️  IMPORTANT: If the block explorer shows version mismatch:');
console.log('   • Your contract was compiled with: ' + exactCompilerVersion);
console.log('   • Make sure to specify the EXACT compiler version when verifying');
console.log('   • Some explorers may not support 0.8.24 - you may need to:');
console.log('     1. Try specifying compiler version manually');
console.log('     2. Or check if the explorer supports 0.8.24');
console.log('     3. Or use Hardhat verify plugin if available');
console.log('');

