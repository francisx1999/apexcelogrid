# How to run ApexCeloGrid

Everything below uses only Node.js (v18+) and npm. No Foundry required.

## 1. Install & test locally

```bash
npm install
npm run build      # compile
npm test           # 20 tests should pass
```

## 2. Get a key and some test CELO

1. Create a fresh wallet (e.g. in MetaMask) and copy its private key.
2. Fund it on **Alfajores testnet** from the faucet: https://faucet.celo.org
3. `cp .env.example .env` and set `PRIVATE_KEY=0x...`

> Use a throwaway key that holds only a little CELO. Never commit `.env`.

## 3. Deploy

```bash
npm run deploy:alfajores      # testnet
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

## 6. Read the ledger (free, no key)

```bash
node submit/index.js total
node submit/index.js get --index 0
```

Or open `web/index.html` in a browser, paste the contract address, and click
**Load records**. Reading never costs anything and needs no wallet.

## 7. Verify on Celoscan (optional)

Set `CELOSCAN_API_KEY` in `.env`, then:

```bash
npx hardhat verify --network alfajores <CONTRACT_ADDRESS> <OWNER_ADDRESS>
```

Once verified, anyone can read the source and call the view functions directly on
https://alfajores.celoscan.io (or https://celoscan.io for mainnet).
