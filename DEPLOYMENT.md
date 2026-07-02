# Deployments

A record of live ApexCeloGrid deployments. All data on a testnet is a public demo; test
tokens have no monetary value.

## Celo Sepolia testnet

| Field | Value |
| ----- | ----- |
| Network | Celo Sepolia (chainId `11142220`) |
| Contract (`ProductionLedger`) | [`0x4581564c4886953eD118269Bc88D3beE01cDc4fe`](https://celo-sepolia.blockscout.com/address/0x4581564c4886953eD118269Bc88D3beE01cDc4fe) |
| Owner (accreditation authority) | `0x8ECc157365feC0C1Bf9e6fa3b6BfB1696E108755` |
| Explorer | https://celo-sepolia.blockscout.com |
| RPC | `https://forno.celo-sepolia.celo-testnet.org` |

> The owner above is a throwaway **testnet-only** wallet used for this demo. Do not send real
> funds to it. A production (mainnet) deployment should set the owner to a governance multisig.

### Demo transactions

The deployment was verified end-to-end with the following live transactions:

| Step | Action | Transaction |
| ---- | ------ | ----------- |
| 1 | Register site `REA-Mokwa-01` (owner) | [`0x63412cddb396edfaf3073f3b12bf4de48d5f60fb26fa2da8c39f9d1b8af39bbb`](https://celo-sepolia.blockscout.com/tx/0x63412cddb396edfaf3073f3b12bf4de48d5f60fb26fa2da8c39f9d1b8af39bbb) |
| 2 | Submit reading — 5,000 kWh, 1-day window (operator) | [`0x8b0009ab1322943e2543801e44234733aa45206d1c1f0274e52c2c9511069c23`](https://celo-sepolia.blockscout.com/tx/0x8b0009ab1322943e2543801e44234733aa45206d1c1f0274e52c2c9511069c23) |
| 3 | Gasless submit — 5,100 kWh, EIP-712 sign → relay | [`0x9b2b154d3fa501ea8350fa5fd25c6611cd9cb19a12f441381da996ff29ab404a`](https://celo-sepolia.blockscout.com/tx/0x9b2b154d3fa501ea8350fa5fd25c6611cd9cb19a12f441381da996ff29ab404a) |

Both records are readable by anyone, for free:

```bash
# via the CLI
CONTRACT_ADDRESS=0x4581564c4886953eD118269Bc88D3beE01cDc4fe \
RPC_URL=https://forno.celo-sepolia.celo-testnet.org \
node submit/index.js total          # -> 2
node submit/index.js get --index 0  # -> the 5,000 kWh reading

# or open web/index.html (address + RPC pre-filled) and click "Load records"
```

## Celo mainnet

Not yet deployed. When ready:

```bash
npm run deploy:celo   # requires a little real CELO for gas (still sub-cent)
```

Set `OWNER_ADDRESS` to a governance multisig before deploying so no single key controls
accreditation.
