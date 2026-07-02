// Deploys ProductionLedger to the configured network.
//
//   PRIVATE_KEY=0x... npm run deploy:alfajores
//   PRIVATE_KEY=0x... npm run deploy:celo
//
// The deployer becomes the contract owner (the accreditation authority).
// Override with OWNER_ADDRESS to hand ownership to a governance address.
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No signer found. Set PRIVATE_KEY in your environment (see .env.example)."
    );
  }

  const owner = process.env.OWNER_ADDRESS || deployer.address;
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`Network:  ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} CELO`);
  console.log(`Owner:    ${owner}`);

  const Factory = await ethers.getContractFactory("ProductionLedger");
  const ledger = await Factory.deploy(owner);
  await ledger.waitForDeployment();

  const address = await ledger.getAddress();
  console.log(`\nProductionLedger deployed at: ${address}`);
  console.log(
    `\nNext steps:\n` +
      `  1. Register a site:  owner calls registerSite(siteId, operator, label)\n` +
      `  2. Point submit/ and web/ at this address (see docs/how-to-run.md)\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
