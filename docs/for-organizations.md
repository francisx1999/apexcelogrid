# ApexCeloGrid — A One-Page Brief for Organizations

*A free, open public record of the electricity Nigeria produces.*

## The problem

Nigeria is adding distributed solar fast — roughly **803 MW in 2025** (≈96% off-grid), with the
Rural Electrification Agency deploying **1,300+ mini-grids** backed by ~**$750m** in public
funds. Every one of those systems produces generation data daily. But that data sits in
proprietary dashboards and spreadsheets that **no outsider can independently verify**. A bank
releasing a results-based payment, a regulator confirming a plant is active, a carbon-credit
buyer, or a citizen — all have to take the operator's number on faith or pay for a bespoke
audit. That friction slows disbursements, inflates the cost of clean-energy certificates, and
leaves the country without a clear, queryable picture of its own generation.

## The solution

ApexCeloGrid writes each verified generation record onto a **public blockchain (Celo)**, where
it is **permanent, tamper-evident, and free for anyone to read** — forever, with no login and
no fee. Only accredited operators can submit data (so numbers are trustworthy), records can
never be edited or deleted (corrections are appended and linked), and there is **no token and
nothing to buy**. It is a public utility, not a financial product.

## See it working (no install, 30 seconds)

- **Live demo:** https://francisx1999.github.io/apexcelogrid/ — click *Load records* to see
  real on-chain data
- **Source code (open, MIT-licensed):** https://github.com/francisx1999/apexcelogrid
- **On-chain proof (block explorer):**
  https://celo-sepolia.blockscout.com/address/0x4581564c4886953eD118269Bc88D3beE01cDc4fe

## What it means for you

| If you are a… | ApexCeloGrid gives you… |
| ------------- | ----------------------- |
| **Government agency / regulator (REA, NERC)** | A single, neutral, national picture of distributed generation — no vendor lock-in, nothing to host |
| **Financier / bank / DFI** | Independently verifiable numbers for results-based finance, cutting audit cost and disbursement delay |
| **Mini-grid operator** | A credible, portable record of your output — join with the meters you already have; you never hold a token or pay a fee |
| **Carbon / REC buyer** | Tamper-evident generation data that is far harder to double-count |
| **AI / data / research team** | An open, machine-readable, verifiable dataset of African energy generation to build analytics and models on |
| **Citizen** | The truth about the electricity produced in your community |

## Why it's low-risk to adopt

- **Free & open source (MIT).** Use it, fork it, or run your own instance. No licence cost, no
  dependence on any single company.
- **Tiny footprint.** One small smart contract plus a simple submission tool. No new
  blockchain, no big servers to run.
- **Sub-cent cost, carbon-negative rails.** Celo fees are a fraction of a naira, and the
  network offsets more carbon than it emits — fitting for a clean-energy registry.
- **Proven.** Deployed and exercised end-to-end on a public test network, with an automated
  test suite (27 passing) and full documentation.

## How to start

1. **Evaluate** — open the live demo and skim the repo (30 minutes for a technical reviewer).
2. **Pilot** — register one or two sites and record real production on the test network, free.
3. **Adopt** — when ready, deploy to Celo mainnet under governance you control (ideally a
   multi-stakeholder multisig). See `docs/how-to-adopt.md`.

The project is offered as an open contribution to Nigeria. The one ask of anyone who adopts,
forks, or builds on it: **use it to help the people of Nigeria.**

**Contact:** no-reply@apexgridapps.com

*This is an informational brief about an open-source public-benefit project. It is not
investment, legal, or financial advice.*
