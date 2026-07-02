# ApexCeloGrid — Technical Specification (v1.0)

## 1. Overview

ApexCeloGrid is a single, small, append-only Solidity contract (`ProductionLedger`)
deployed to the Celo blockchain, plus an open-source submission CLI and a read-only web
viewer. It records verified electricity-generation readings so that operators, financiers,
regulators, and citizens share one set of honest numbers.

## 2. Data model

Each record:

| Field          | Type      | Meaning                                                        |
| -------------- | --------- | -------------------------------------------------------------- |
| `siteId`       | `bytes32` | Registered generation site (a readable label, encoded)         |
| `periodStart`  | `uint64`  | Unix seconds — start of window (inclusive)                     |
| `periodEnd`    | `uint64`  | Unix seconds — end of window (exclusive); must be `> start`    |
| `energyWh`     | `uint256` | Energy produced in the window, whole watt-hours, no rounding   |
| `submitter`    | `address` | Operator address that recorded it                              |
| `submittedAt`  | `uint64`  | Unix seconds the record was written on-chain                   |
| `correctsIndex`| `uint256` | Index this record adjusts, or `type(uint256).max` if original |

**On-chain vs off-chain.** Only compact, high-value summaries go on-chain (e.g. energy per
site per day). Raw high-frequency meter telemetry stays off-chain and can be referenced by
a cryptographic fingerprint. No personal or household-consumption data is placed on-chain.

## 3. Trust model (v1)

The ledger being append-only guarantees history is never rewritten, but not that a number
is legitimate. v1 closes that gap with a **site registry + per-site operator allowlist**:

- **`registerSite(bytes32 siteId, address operator, string label)`** — *owner only.*
  Registers a site and authorizes exactly one operator address. Reverts on a zero operator
  or a site that is already registered.
- **`setOperator(bytes32 siteId, address newOperator)`** — *owner only.* Rotates or revokes
  an operator (by pointing it at a new address). Existing records are unaffected.
- **`submit(...)`** — *authorized operator only.* Records an original reading. Reverts if the
  site is not registered, the caller is not the site's operator, the period is invalid
  (`end <= start`), or `energyWh == 0`.
- **`submitBatch(Reading[] readings)`** — *authorized operator only.* Records many original
  readings in one transaction (atomic: any invalid or unauthorized reading reverts the whole
  batch). Each reading is authorized per-site, so a batch may span any sites the caller
  operates. Reverts on an empty batch. The loop is bounded only by the caller's own gas and
  is fully permissioned, so it has no griefing surface.
- **`submitAdjustment(uint256 correctsIndex, ...)`** — *authorized operator only.* Appends a
  correction linked to an earlier record for the **same** site. The original is never
  modified. Reverts on an out-of-range index or a site mismatch.

The **owner** is intended to be a lightweight, multi-stakeholder governance address
(regulator/REA, operator associations, independent maintainers) responsible **only** for
accreditation — never for editing or deleting production data, which is impossible by design.

### Views

- `records(uint256)` / `getRecord(uint256) → Record` — read a record by index.
- `total() → uint256` — number of records (originals + adjustments).
- `siteOperator(bytes32) → address` — the authorized operator (or `0x0` if unregistered).
- `isRegistered(bytes32) → bool`.
- `siteLabel(bytes32) → string`.

### Events (for off-chain indexing)

- `SiteRegistered(bytes32 indexed siteId, address indexed operator, string label)`
- `OperatorChanged(bytes32 indexed siteId, address indexed oldOperator, address indexed newOperator)`
- `Recorded(bytes32 indexed siteId, uint64 periodStart, uint64 periodEnd, uint256 energyWh, uint256 indexed index, uint256 correctsIndex)`

## 4. Security properties & how they are enforced

| Concern                        | Mitigation                                                            |
| ------------------------------ | -------------------------------------------------------------------- |
| Unauthorized / fake writes     | Per-site operator allowlist; `submit` reverts for non-operators      |
| Editing / deleting history     | No update/delete functions; corrections are append-only linked rows  |
| Garbage data                   | Validates `periodEnd > periodStart` and `energyWh > 0`               |
| Cross-site correction spoofing | `submitAdjustment` requires the target record's `siteId` to match    |
| Integer overflow               | Solidity ≥0.8 checked arithmetic; no `unchecked` blocks              |
| Reentrancy                     | No external calls, no value transfer — no reentrancy surface         |
| Privileged-role abuse          | Owner can accredit sites but **cannot** alter or remove records      |
| Access-control library         | OpenZeppelin `Ownable` (audited)                                     |

Ownership can be transferred (`transferOwnership`) to a governance multisig, or renounced
after registration to freeze the site set.

## 5. Deployment targets

| Network          | chainId | RPC (default)                                   |
| ---------------- | ------- | ----------------------------------------------- |
| Celo Alfajores   | 44787   | `https://alfajores-forno.celo-testnet.org`      |
| Celo mainnet     | 42220   | `https://forno.celo.org`                        |

Solidity `0.8.24`, optimizer on (200 runs), EVM target `paris` (Celo-compatible).

## 6. Roadmap — optional v1.1+ modules

These are **not** required for v1 and are added only if the project is adopted:

1. **EIP-712 signed readings (gasless).** An operator signs a reading off-chain with its
   registered key; anyone (or a paymaster) relays it on-chain. This preserves authenticity
   while letting a shared treasury sponsor gas, so an operator never holds a token. The
   contract would recover the signer and check it against the registered site key, plus a
   per-site nonce and `deadline` to prevent replay.
2. **Multi-key sites.** Allow more than one authorized key per site (e.g. a backup device).
3. **Renewable-energy-certificate (REC) module.** Issue/track certificates against records.
4. **Richer site metadata / registry contract.** Capacity, location hash, accreditation ref.

## 7. Testing

`npm test` runs a Hardhat suite (20 cases) covering registration and access control,
operator authorization, input validation, batch submission (atomicity, cross-site,
empty-batch), event emission and indices, append-only adjustments (including cross-site
rejection), and an accumulation property test.

## 8. Contact

General questions and responsible-disclosure reports: **no-reply@apexgridapps.com**. See
[`../SECURITY.md`](../SECURITY.md).
