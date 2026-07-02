# ApexCeloGrid — White Paper

**An open public ledger for Nigeria's electricity**

*Version 1.1 · July 2026 · Open-source · Free for everyone · Built for public benefit*

> This markdown supersedes the v1.0 PDF sketch. The substantive change is in §6, where the
> smart contract now enforces **authorized submission** (a site registry + operator
> allowlist), so the "verified" claim throughout this paper is delivered by the code rather
> than merely asserted. See `docs/CHANGES.md` for the before/after.

## 1. Abstract

ApexCeloGrid is an open-source public ledger that records how much electricity is generated
by solar mini-grids and other power systems across Nigeria. Each production record is
submitted by an **accredited operator** and written to the Celo public blockchain, where it
is permanent, tamper-evident, and readable by anyone at no cost. The project is deliberately
minimal — a small smart contract and an open submission tool — so that it can be built
quickly, run cheaply, and adopted by anyone. Its purpose is not profit but public benefit:
to give operators, financiers, regulators, and citizens a single set of honest numbers about
the electricity Nigeria produces.

## 2. The opportunity: Nigeria's distributed-energy boom

Nigeria is in the middle of a distributed-energy surge. In 2025 the country added roughly
803 MW of solar capacity, about 96% of it off-grid, and the Rural Electrification Agency
(REA) is deploying more than 1,300 solar mini-grids backed by around $750 million in public
funds, including 250 interconnected mini-grids designed to feed the national grid.

These thousands of small generators produce data every day. But that data is scattered
across proprietary dashboards and spreadsheets, none of which an outsider can independently
verify. As the sector scales, the absence of a shared, trusted record becomes a growing
bottleneck.

| Indicator (2024–2026) | Figure | Why it matters here |
| --------------------- | ------ | ------------------- |
| Solar added in 2025 | ~803 MW, ~96% off-grid | A large, growing base of generators to record |
| REA mini-grid programme | 1,300+ mini-grids; ~$750m; 250 interconnected | A natural first cohort for a public ledger |
| Regulatory framework | NERC Mini-Grid Regulations 2023 (limits raised to 5–10 MW) | Formal basis; larger assets raise the value of verified data |
| Access reach | DARES programme: 4.1m+ people reached | Strong public-interest case for transparency |

*Figures from public 2024–2026 reporting; see References. Refresh at project kick-off.*

## 3. The problem: data nobody can verify

The problem is not measurement — operators already meter their output. The problem is trust
and portability. A production figure lives inside one operator's system. A bank verifying a
results-based payment, a regulator confirming a plant is active, a carbon buyer, or a citizen
all have to take that number on faith or pay for a bespoke audit.

This friction slows disbursements, makes clean-energy certificates costly and easy to
double-count, and leaves the country without a clear, queryable picture of its own
distributed generation. What is missing is a neutral record that no single party owns and
everyone can check.

## 4. The solution: ApexCeloGrid

ApexCeloGrid records accredited production onto a public blockchain that already exists, so
the record is open, permanent, and free to read. It is built on three commitments:

- **Free for everyone.** Free to read and free to take part. No operator, agency, or citizen
  is ever charged to use it.
- **Simple to adopt.** It works with the metering equipment operators already have. Joining
  requires no special hardware and no blockchain expertise.
- **Fully open source.** The code is public under a permissive licence. Anyone may use it,
  copy it, or build on it.

Crucially, ApexCeloGrid is **not** a new blockchain. Deploying a small contract onto an
established public chain is a job a single developer can ship — and it inherits the openness
and durability of a network already run by thousands of computers worldwide.

## 5. How it works

Data flows from a meter, through a simple tool, into one public contract — and out to anyone
who wants to read it.

```
   Generation system / meter
        | a reading: site, period, kWh
        v
   Submission tool (open-source, free to run) — signs with the site's authorized key
        | one small transaction
        v
   Celo public blockchain — ProductionLedger contract (append-only, authorized writes)
        |
        +--> Anyone reads it: block explorer · public API · ApexCeloGrid website
```

### 5.1 What goes on-chain (and what does not)

Only compact, high-value summaries are stored on-chain — for example, the energy a site
produced in a day. Raw high-frequency meter telemetry stays off-chain and is referenced by a
cryptographic fingerprint, keeping the ledger small, cheap, and privacy-respecting. **No
personal or household-consumption data is ever placed on-chain.**

| Field | Meaning |
| ----- | ------- |
| `siteId` | Which registered generation site produced the power |
| `periodStart` / `periodEnd` | The time window covered by the record |
| `energyWh` | Energy produced in the window (whole watt-hours, no rounding) |

## 6. The smart contract

The core is one small, append-only Solidity contract with a **site registry** so that only an
accredited operator can submit for a site — this is what makes the recorded data *verified*
rather than a public bulletin board that anyone could write false numbers to.

Key rules:

- The **owner** (a lightweight, multi-stakeholder accreditation authority) registers each
  site and its authorized **operator** address — and can rotate that operator — but can
  **never** edit or delete a production record.
- **`submit`** accepts a reading only from the site's authorized operator, and only if the
  period is valid (`end > start`) and the energy is non-zero.
- Corrections never rewrite history: **`submitAdjustment`** appends a new record *linked* to
  the one it corrects.

The contract also supports **gasless submission** (`submitSigned`): an operator signs a
reading off-chain and any relayer or paymaster submits it and pays the sub-cent fee, so an
operator never needs a token — while the record stays authenticated by the operator's
signature (with a per-operator nonce and deadline preventing replay).

The full, tested source is [`contracts/ProductionLedger.sol`](../contracts/ProductionLedger.sol);
the API is documented in [`technical-spec.md`](technical-spec.md). Everything beyond this —
multiple keys per site, signed *batches*, or a renewable-energy-certificate module — remains
optional and can be added later, only if the project is adopted. The guiding principle is:
**ship the smallest useful version first.**

## 7. Why Celo

The requirements — public, free to read, extremely low cost, and credible on sustainability —
point to a public, low-fee, energy-efficient (proof-of-stake) EVM chain. Celo fits precisely:

- **Sub-cent fees.** Recording a record costs a tiny fraction of a naira.
- **Carbon-negative.** Celo offsets more carbon than it emits — fitting for a clean-energy
  registry.
- **Mobile-first.** Designed for the low-bandwidth, phone-based access common in Nigeria.
- **Ethereum-secured.** Since 2025, Celo runs as an Ethereum Layer 2, inheriting Ethereum's
  security.
- **EVM / Solidity.** Standard tooling, and portable — the same contract can run on Polygon
  or another EVM chain if ever needed.

## 8. Free for everyone

"Free for everyone" is the non-negotiable requirement, and the design delivers it at every level:

- **Readers pay nothing, ever.** Public explorers, a free API, and the ApexCeloGrid website
  expose all data openly.
- **Operators pay nothing to take part.** The tiny transaction fee can be sponsored by a
  shared treasury (a "paymaster"), so an operator never holds a token, touches an exchange,
  or sees a bill. This is **implemented** via `submitSigned`: an operator signs a reading
  off-chain (EIP-712) and any relayer submits it and pays the gas, while the record is still
  credited to — and authenticated by — the operator. See §6 and the technical spec §3.1.
- **No coin, no speculation.** ApexCeloGrid has no token of its own. It is a public utility,
  not a financial product.

**An honest note on cost.** "Free for everyone" means no *user* is ever charged — not that the
shared backbone is costless. Servers and maintenance are funded by grants, public support, or
optional premium services for commercial users (such as certificate issuance), so that
ordinary access stays free forever. This mirrors how public goods like Wikipedia and
OpenStreetMap remain free to all while a foundation funds the infrastructure.

## 9. Open source and adoption

All code is published under a permissive licence (MIT). The structure:

```
apexcelogrid/
  contracts/   ProductionLedger.sol (+ tests)
  submit/      open-source submission CLI
  web/         public site: read records + docs + repo link
  docs/        white paper + technical spec + how-to guides
  README.md
  LICENSE
```

The author's role ends at "published and documented." From there, anyone can adopt or fork it
— an operator, a state agency, a university, or a developer — and run it for their community.

## 10. Governance

ApexCeloGrid stores public data on a public chain, so it needs very little governance. Read
access is open and permissionless by design. The **only** governed action is **accreditation**
— confirming that a submitting site and its operator key are genuine. A lightweight,
multi-stakeholder approach is recommended: a small group that may include the regulator or REA,
mini-grid operator associations, and independent maintainers. **No party can edit or delete
production records; the ledger is append-only, and corrections are made by adding a linked
adjustment, never by rewriting history.**

## 11. Roadmap

| Phase | Focus | Outcome |
| ----- | ----- | ------- |
| 1 — Build | Contract + submission tool on Celo testnet | Working prototype, free to test |
| 2 — Publish | Public repo, website, white paper, docs | Anyone can find, read, and fork it |
| 3 — Launch | Deploy to Celo mainnet; onboard first volunteer sites | Real production records, publicly verifiable |
| 4 — Adoption | Operators/agencies run it; optional registry & certificate modules | A growing national record — driven by others |

## 12. Impact

- A single, trusted public record of distributed generation in Nigeria.
- Faster, cheaper verification for results-based finance and clean-energy certificates.
- Transparency for citizens about the electricity produced in their communities.
- A reusable open-source foundation others can extend across the region.

## 13. Conclusion and call to action

ApexCeloGrid is a small idea with a large purpose: give everyone the same honest numbers about
the electricity Nigeria produces, for free, forever. It is intentionally simple to build, cheap
to run, and open to all.

This is an open contribution to the country. Whoever adopts, forks, or builds on ApexCeloGrid
is asked to do one thing in return: **use it to help the people of Nigeria.**

## References

1. NERC — Mini-Grid Regulations, 2023. nerc.gov.ng
2. Ecofin Agency — Nigeria adds 803 MW of solar in 2025, off-grid dominant. ecofinagency.com
3. Industrial Info — Nigeria's $750m mini-solar-grid strategy. industrialinfo.com
4. Mondaq — Understanding I-RECs and Nigeria's clean-energy transition. mondaq.com
5. Celo Documentation — Why Celo (Ethereum L2, carbon-negative, low fees). docs.celo.org

---

*This white paper is an informational document about an open-source project. It is not
investment, legal, or financial advice.*
