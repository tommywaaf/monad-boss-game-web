import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the compiled contract artifact
const artifactPath = join(__dirname, '../artifacts/contracts/BossFightGame.sol/BossFightGame.json');
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));

console.log('🔍 Bytecode Analysis');
console.log('='.repeat(60));
console.log('');

// Get the first 100 characters of bytecode to show it's unique
const bytecode = artifact.bytecode;
const deployedBytecode = artifact.deployedBytecode;

console.log('📦 Bytecode (first 200 chars):');
console.log(bytecode.substring(0, 200) + '...');
console.log('');
console.log('📦 Deployed Bytecode (first 200 chars):');
console.log(deployedBytecode.substring(0, 200) + '...');
console.log('');
console.log('📊 Bytecode Statistics:');
console.log(`   • Full bytecode length: ${bytecode.length} characters`);
console.log(`   • Deployed bytecode length: ${deployedBytecode.length} characters`);
console.log('');

// Extract compiler version from metadata if available
const metadataMatch = bytecode.match(/64736f6c6343([0-9a-f]+)/);
if (metadataMatch) {
  const metadata = metadataMatch[1];
  console.log('🔍 Embedded Metadata (compiler info):');
  console.log(`   • Metadata hash: ${metadata.substring(0, 20)}...`);
  console.log('   • This metadata includes the compiler version');
  console.log('');
}

console.log('❌ Answer: NO - Bytecode will be DIFFERENT');
console.log('');
console.log('Why different compiler versions produce different bytecode:');
console.log('   1. Compiler optimizations change between versions');
console.log('   2. Code generation patterns improve/change');
console.log('   3. Metadata encoding differs');
console.log('   4. IR pipeline (viaIR) may generate different code');
console.log('   5. Gas optimization strategies evolve');
console.log('');
console.log('✅ Solution: You MUST use the exact compiler version (0.8.24)');
console.log('   The block explorer will compare:');
console.log('   • Your deployed bytecode (from chain)');
console.log('   • Recompiled bytecode (using specified compiler)');
console.log('   If they don\'t match → verification fails');
console.log('');
console.log('💡 If the explorer doesn\'t support 0.8.24, you have two options:');
console.log('   1. Wait for explorer to add 0.8.24 support');
console.log('   2. Recompile with 0.8.31 and redeploy (NOT recommended - changes bytecode)');
console.log('');

