import hre from "hardhat";

async function main() {
  console.log("Deploying BossFightGame to Monad...");

  const BossFightGame = await hre.ethers.getContractFactory("BossFightGame");
  const game = await BossFightGame.deploy();

  await game.waitForDeployment();

  const address = await game.getAddress();
  console.log("✅ BossFightGame deployed to:", address);
  console.log("\nAdd this to your .env file:");
  console.log(`VITE_CONTRACT_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

