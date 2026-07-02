# How to run ApexCeloGrid

Everything below uses only Node.js (v18+) and npm. No Foundry required.

## 1. Install & test locally

```bash
npm install
npm run build      # compile
npm test           # 27 tests should pass
```

## 2. Get a key and some test CELO

1. Create a fresh wallet (e.g. in MetaMask) and copy its private key.
2. Fund it on **Celo Sepolia testnet** from the faucet: https://faucet.celo.org/celo-sepolia
3. `cp .env.example .env` and set `PRIVATE_KEY=0x...`

> Use a throwaway key that holds only a little CELO. Never commit `.env`.

**Celo Sepolia network reference** (the current L2 testnet):

| Field | Value |
| ----- | ----- |
| Chain ID | `11142220` |
| RPC URL | `https://forno.celo-sepolia.celo-testnet.org` |
| Explorer | `https://celo-sepolia.blockscout.com` |
| Faucet | `https://faucet.celo.org/celo-sepolia` |

## 3. Deploy

```bash
npm run deploy:sepolia        # Celo Sepolia testnet (recommended)
# npm run deploy:alfajores    # older Alfajores testnet
# npm run deploy:celo         # mainnet (real CELO for gas — still sub-cent)
```

The output prints the deployed **contract address**. The deployer becomes the **owner**
(accreditation authority). To hand ownership to a governance address instead, set
`OWNER_ADDRESS` before deploying.

## 4. Register a site (owner)

```bash
cd submit && npm install
cd ..
# set CONTRACT_ADDRESS in .env first, then:
node submit/index.js register \
  --site "REA-Mokwa-01" \
  --operator 0xOPERATOR_ADDRESS \
  --label "Mokwa solar mini-grid"
```

## 5. Submit a reading (operator)

The operator uses **its own** key (`PRIVATE_KEY` = the operator address you registered).

```bash
# One day, 5,000 kWh produced. Energy is in whole watt-hours: 5,000 kWh = 5,000,000 Wh.
node submit/index.js submit \
  --site "REA-Mokwa-01" \
  --start 1719792000 \
  --end   1719878400 \
  --wh    5000000
```

Submit many readings (e.g. a whole day across several sites) in **one** transaction:

```bash
# edit submit/readings.example.json, then:
node submit/index.js batch --file submit/readings.example.json
```

Correct an earlier record without rewriting it:

```bash
node submit/index.js adjust --index 0 --site "REA-Mokwa-01" \
  --start 1719792000 --end 1719878400 --wh 4800000
```

### 5a. Gasless submission (operator never holds a token)

An operator can **sign** a reading off-chain (no gas, no token), and **anyone** — a paymaster,
a state agency, or a volunteer — can **relay** it on-chain and pay the sub-cent fee.

```bash
# Operator signs (PRIVATE_KEY = the operator key). Produces a JSON payload:
node submit/index.js sign \
  --site "REA-Mokwa-01" --start 1719792000 --end 1719878400 --wh 5000000 \
  --out reading.signed.json

# Anyone relays it (PRIVATE_KEY = the relayer's own key; the relayer pays gas).
# The record is credited to the operator, not the relayer.
node submit/index.js relay --file reading.signed.json
```

The signature is valid for 24h by default (override with `--deadline <unix>`), single-use
(a per-operator nonce prevents replay), and cannot be altered — changing any field
invalidates it.

## 6. Read the ledger (free, no key)

```bash
node submit/index.js total
node submit/index.js get --index 0
```

Or open `web/index.html` in a browser, paste the contract address, and click
**Load records**. Reading never costs anything and needs no wallet.

## 7. Verify on Celoscan (optional)

```bash
npx hardhat verify --network celoSepolia <CONTRACT_ADDRESS> <OWNER_ADDRESS>
```

Celo Sepolia uses Blockscout (no API key required for basic verification). Once verified,
anyone can read the source and call the view functions directly on
https://celo-sepolia.blockscout.com (or https://celoscan.io for mainnet).
