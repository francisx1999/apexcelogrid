# ApexCeloGrid

**An open public ledger for Nigeria's electricity generation — on Celo.**

A free, open-source system that records **verified** electricity generation — from solar
mini-grids to any generator in Nigeria — onto a public blockchain that anyone can read,
verify, and build on. Reading is free forever. There is no token and nothing to buy.

> In one sentence: ApexCeloGrid is a free, open, and trustworthy record of who is
> generating electricity in Nigeria, where, and how much.

---

## Repository layout

```
apexcelogrid/
  contracts/            ProductionLedger.sol — the append-only public ledger
  test/                 Hardhat unit + property tests (20 passing)
  scripts/deploy.js     deploy to Celo Alfajores testnet / mainnet
  submit/               open-source CLI: register sites (owner) + submit readings (operator)
  web/index.html        minimal, read-only page that lists records (no wallet needed)
  docs/                 technical spec, how-to-run, how-to-adopt, corrected white paper
  hardhat.config.js     Celo network config
  README.md  LICENSE(MIT)  .env.example
```

## The trust model (why the data is "verified")

The ledger is **append-only** — records can never be edited or deleted. But append-only
alone does not make numbers trustworthy: someone still has to be *authorized* to write
them. So v1 uses a small **site registry**:

1. A governance **owner** (the accreditation authority) registers each site and names the
   **operator address** allowed to submit for it — `registerSite(siteId, operator, label)`.
2. `submit()` **requires the caller to be that site's authorized operator**, and validates
   the reading (`periodEnd > periodStart`, `energyWh > 0`).
3. Corrections never rewrite history: `submitAdjustment()` appends a new record **linked**
   to the one it corrects.

This is the key hardening over the original white-paper sketch, whose `submit()` was
public and unauthenticated — meaning anyone could write any number for any site. See
[`docs/CHANGES.md`](docs/CHANGES.md) for the full before/after.

A future **v1.1** may add EIP-712 signed readings so anyone can *relay* an operator's
signed data (enabling gasless submission via a Celo paymaster) — documented in
[`docs/technical-spec.md`](docs/technical-spec.md).

## Quick start

```bash
npm install            # install Hardhat + OpenZeppelin
npm run build          # compile the contract
npm test               # run the test suite (20 passing)
```

Deploy (needs a funded key — see `.env.example`):

```bash
cp .env.example .env   # then edit PRIVATE_KEY
npm run deploy:alfajores   # Celo testnet (free faucet CELO)
# npm run deploy:celo      # Celo mainnet
```

Register a site and submit a reading:

```bash
cd submit && npm install
# owner:
node index.js register --site "REA-Mokwa-01" --operator 0xOPERATOR --label "Mokwa mini-grid"
# operator (1-day window, 5,000 kWh = 5,000,000 Wh):
node index.js submit --site "REA-Mokwa-01" --start 1719792000 --end 1719878400 --wh 5000000
# many readings in one transaction:
node index.js batch --file readings.example.json
node index.js total
```

View records: open `web/index.html`, paste the deployed contract address, click **Load records**.

## Documentation

- [Technical specification](docs/technical-spec.md) — contract API, data model, trust model, v1.1 roadmap
- [How to run](docs/how-to-run.md) — deploy, register, submit, read, verify
- [How to adopt](docs/how-to-adopt.md) — fork it and run it for your community
- [White paper (corrected markdown)](docs/WhitePaper.md)
- [What changed vs the original sketch](docs/CHANGES.md)

## Why Celo

Public, sub-cent fees, carbon-negative, mobile-first, and — since 2025 — an Ethereum
Layer 2, so it inherits Ethereum's security. The contract is vanilla Solidity and portable
to any EVM chain.

## Contributing & security

- Contributions and forks welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md). CI runs the full
  test suite on every push.
- Found a vulnerability? **Do not open a public issue** — email **no-reply@apexgridapps.com**.
  See [`SECURITY.md`](SECURITY.md).

## Contact

General questions and disclosures: **no-reply@apexgridapps.com** · https://apexgridapps.com

## Licence

MIT. This is an open contribution to Nigeria. Whoever adopts, forks, or builds on
ApexCeloGrid is asked to do one thing in return: **use it to help the people of Nigeria.**

> This repository is an open-source public-benefit project. It is not investment, legal, or
> financial advice.
