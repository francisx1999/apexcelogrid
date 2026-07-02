# Contributing to ApexCeloGrid

ApexCeloGrid is an open contribution to Nigeria. Contributions, forks, and adoptions are all
welcome — the clearer and simpler the project stays, the more likely it is to be adopted.

## Guiding principle

**Ship the smallest useful version first.** Before adding a feature, ask whether it is needed
for v1 or whether it belongs in the optional-modules roadmap
(`docs/technical-spec.md §6`). Favour small, well-tested changes over large ones.

## Getting set up

```bash
npm install
npm run build      # compile
npm test           # all tests must pass (currently 20)
```

## Making a change

1. Fork and branch (`feature/…` or `fix/…`).
2. Keep the contract minimal and heavily commented (NatSpec on public/external functions).
3. **Every contract change needs tests** — unit tests for new paths, and a revert test for
   every new `require`/custom error. Run `npm test` and keep it green.
4. Update the relevant docs (`README.md`, `docs/technical-spec.md`) in the same change.
5. Open a pull request describing *what* changed and *why*. CI runs the test suite on every
   push (see `.github/workflows/test.yml`).

## Security

For anything security-sensitive, **do not** open a public issue — email
**no-reply@apexgridapps.com**. See [`SECURITY.md`](SECURITY.md).

## Style

- Solidity `^0.8.20`, optimizer on, no `unchecked` blocks without a clear justification.
- Prefer custom errors over `require` strings (cheaper, clearer).
- Prefer OpenZeppelin primitives over hand-rolled ones.
- JavaScript: match the existing style in `scripts/` and `submit/`.

## Questions

Open a discussion/issue on the repository, or email **no-reply@apexgridapps.com**.
