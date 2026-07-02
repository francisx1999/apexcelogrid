# Security Policy

ApexCeloGrid is an open, public-benefit smart contract that records real electricity-
generation data. We take security seriously and welcome responsible disclosure.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Email **no-reply@apexgridapps.com** with:

- a description of the issue and its impact,
- steps to reproduce (a failing test or transaction trace is ideal),
- any suggested fix.

We aim to acknowledge reports within a few business days. Please give us reasonable time to
investigate and ship a fix before any public disclosure.

## Scope

In scope:

- `contracts/ProductionLedger.sol` — access control, validation, append-only guarantees,
  economic/round-trip correctness.
- `scripts/` and `submit/` — anything that could cause loss of funds, key exposure, or
  submission of unauthorized/incorrect data.

Out of scope:

- The public Celo network itself, third-party RPC providers, and block explorers.
- Gas costs, and issues requiring a compromised operator or owner key (the trust model
  assumes those keys are held securely — see below).

## Trust assumptions

- **Owner key** (accreditation authority): can register sites and rotate operators. It
  **cannot** edit or delete records. Should be held by a governance multisig in production.
- **Operator keys**: can submit/adjust records only for the site(s) they are authorized for.
  Operators are responsible for the security of their own keys.
- Records are **append-only**; corrections are made by appending a linked adjustment, never
  by rewriting history.

## Before mainnet

This code passes a full unit + property test suite, but has **not** undergone an independent
professional audit. Anyone deploying to Celo mainnet for high-stakes use should commission
one first. See `docs/technical-spec.md §4` for the enforced security properties.
