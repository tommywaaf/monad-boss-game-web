import hre from "hardhat";

/**
 * Verify contract on Monad block explorer using Sourcify
 * 
 * Usage:
 *   npx hardhat run scripts/verify.js --network monad
 * 
 * Or with address as argument:
 *   npx hardhat run scripts/verify.js --network monad --address 0x...
 * 
 * Or using CLI directly:
 *   npx hardhat verify --network monad --contract contracts/BossFightGame.sol:BossFightGame 0x08457C0822A929f366A3c0Ab65c3239EDf3c774D
 */
async function main() {
  // Contract address - can be overridden with CONTRACT_ADDRESS env var
  const contractAddress = process.env.CONTRACT_ADDRESS || "0x08457C0822A929f366A3c0Ab65c3239EDf3c774D";
  
  console.log("🔍 Verifying BossFightGame contract on Monad...");
  console.log(`📍 Contract Address: ${contractAddress}`);
  console.log(`📋 Compiler: 0.8.24 (via IR, optimizer enabled, 200 runs)`);
  console.log(`🌐 Sourcify API: https://sourcify-api-monad.blockvision.org/`);
  console.log('');

  try {
    await hre.run("verify:verify", {
      address: contractAddress,
      contract: "contracts/BossFightGame.sol:BossFightGame",
      constructorArguments: [], // BossFightGame has no constructor arguments
    });
    
    console.log("");
    console.log("✅ Contract verified successfully!");
    console.log(`🔗 View on explorer: https://monadvision.com/address/${contractAddress}`);
  } catch (error) {
    if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
      console.log("");
      console.log("✅ Contract is already verified!");
      console.log(`🔗 View on explorer: https://monadvision.com/address/${contractAddress}`);
    } else {
      console.error("");
      console.error("❌ Verification failed:", error.message);
      console.log("");
      console.log("💡 Alternative: Use Hardhat CLI directly:");
      console.log(`   npx hardhat verify --network monad --contract contracts/BossFightGame.sol:BossFightGame ${contractAddress}`);
      console.log("");
      console.log("💡 Or verify manually on the block explorer:");
      console.log(`   1. Go to: https://monadvision.com/address/${contractAddress}`);
      console.log("   2. Click 'Verify Contract'");
      console.log("   3. Select 'Solidity (Hardhat)'");
      console.log("   4. Follow the instructions provided");
      process.exit(1);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

