require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Read deployment secrets from the environment (never commit these).
// See .env.example. PRIVATE_KEY is optional so that `compile` and `test`
// work with no configuration at all.
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Celo Alfajores testnet (free test CELO from a faucet).
    alfajores: {
      url: process.env.ALFAJORES_RPC_URL || "https://alfajores-forno.celo-testnet.org",
      accounts,
      chainId: 44787,
    },
    // Celo mainnet (Ethereum L2 since 2025).
    celo: {
      url: process.env.CELO_RPC_URL || "https://forno.celo.org",
      accounts,
      chainId: 42220,
    },
  },
  etherscan: {
    // Celoscan verification (optional). Set CELOSCAN_API_KEY to enable.
    apiKey: {
      alfajores: process.env.CELOSCAN_API_KEY || "",
      celo: process.env.CELOSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "alfajores",
        chainId: 44787,
        urls: {
          apiURL: "https://api-alfajores.celoscan.io/api",
          browserURL: "https://alfajores.celoscan.io",
        },
      },
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://api.celoscan.io/api",
          browserURL: "https://celoscan.io",
        },
      },
    ],
  },
};
