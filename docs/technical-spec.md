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
- **`submitSigned(bytes32 siteId, ..., uint256 deadline, bytes signature)`** — *anyone may
  call; the operator must have signed.* Gasless path: the operator signs a reading off-chain
  (EIP-712) and any relayer submits it and pays the gas. The recorded `submitter` is the
  **operator**, not the caller. See §3.1.

### 3.1 Gasless submission (EIP-712)

`submitSigned` lets an operator participate without ever holding a token: a paymaster or
relayer pays the gas. Authenticity and anti-replay are preserved cryptographically.

- **Domain:** `EIP712("ApexCeloGrid", "1")`, bound to this contract's address and chainId.
- **Signed struct:** `Reading(bytes32 siteId, uint64 periodStart, uint64 periodEnd, uint256 energyWh, uint256 nonce, uint256 deadline)`.
- **Authorization:** the recovered signer must equal `siteOperator[siteId]`. A tampered field
  or a non-operator signature recovers a different address and reverts.
- **Replay protection:** a **per-operator sequential nonce** (`nonces(address)`), consumed on
  success. Re-submitting a used signature recovers the wrong signer (nonce moved on) and
  reverts. The nonce is only consumed if the whole call succeeds.
- **Expiry:** `deadline` (unix seconds); a signature past its deadline is rejected.
- **Event:** `RelayedSubmission(siteId, relayer, operator, index)` in addition to `Recorded`.

Only single readings are signable in this version; a signed *batch* is a possible future
extension. Operators read their current nonce from `nonces(operatorAddress)` before signing.

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
| Garbage data                   | Validates `periodEnd > periodStart` and `energyWh > 0` (both paths)  |
| Cross-site correction spoofing | `submitAdjustment` requires the target record's `siteId` to match    |
| Signature replay (gasless)     | Per-operator sequential nonce + `deadline`; nonce consumed on success |
| Signature forgery / tampering  | EIP-712 typed-data recovery; signer must equal the site operator     |
| Relayer impersonation          | `submitSigned` records the operator as submitter, never the relayer  |
| Integer overflow               | Solidity ≥0.8 checked arithmetic; the only `unchecked` is a nonce increment that cannot realistically overflow |
| Reentrancy                     | No external calls, no value transfer — no reentrancy surface         |
| Privileged-role abuse          | Owner can accredit sites but **cannot** alter or remove records      |
| Crypto / access libraries      | OpenZeppelin `Ownable`, `EIP712`, `ECDSA` (audited), pinned to 5.0.2 |

Ownership can be transferred (`transferOwnership`) to a governance multisig, or renounced
after registration to freeze the site set.

## 5. Deployment targets

| Network          | chainId    | RPC (default)                                      |
| ---------------- | ---------- | -------------------------------------------------- |
| Celo Sepolia     | 11142220   | `https://forno.celo-sepolia.celo-testnet.org`      |
| Celo Alfajores   | 44787      | `https://alfajores-forno.celo-testnet.org`         |
| Celo mainnet     | 42220      | `https://forno.celo.org`                           |

Solidity `0.8.24`, optimizer on (200 runs), EVM target `paris` (Celo-compatible).

## 6. Roadmap — optional modules

**Implemented (v1.1):**

- **EIP-712 signed readings (gasless).** ✅ See §3.1 / `submitSigned`. An operator signs a
  reading off-chain; a paymaster or relayer submits it and pays the gas, so an operator never
  holds a token. Authenticity is preserved (signer must be the site operator) with a
  per-operator nonce and `deadline` for replay protection.

**Still optional, added only if adopted:**

1. **Signed batches.** A single signature authorizing many readings at once.
2. **Multi-key sites.** Allow more than one authorized key per site (e.g. a backup device).
3. **Renewable-energy-certificate (REC) module.** Issue/track certificates against records.
4. **Richer site metadata / registry contract.** Capacity, location hash, accreditation ref.

## 7. Testing

`npm test` runs a Hardhat suite (27 cases) covering registration and access control,
operator authorization, input validation, batch submission (atomicity, cross-site,
empty-batch), gasless EIP-712 submission (relay, replay, expiry, tampering, forgery,
validation, unregistered site), event emission and indices, append-only adjustments
(including cross-site rejection), and an accumulation property test.

## 8. Contact

General questions and responsible-disclosure reports: **no-reply@apexgridapps.com**. See
[`../SECURITY.md`](../SECURITY.md).
