# What changed vs the original white-paper sketch

The original v1.0 PDF proposed this contract as "the entire first version":

```solidity
contract ProductionLedger {
    struct Record { bytes32 siteId; uint64 periodStart; uint64 periodEnd; uint256 energyWh; }
    Record[] public records;
    event Recorded(bytes32 indexed siteId, uint64 periodStart, uint64 periodEnd, uint256 energyWh, uint256 index);
    function submit(bytes32 siteId, uint64 periodStart, uint64 periodEnd, uint256 energyWh) external {
        records.push(Record(siteId, periodStart, periodEnd, energyWh));
        emit Recorded(siteId, periodStart, periodEnd, energyWh, records.length - 1);
    }
    function total() external view returns (uint256) { return records.length; }
}
```

## The core problem

The paper repeatedly promises **"verified," "trustworthy," "tamper-evident"** data — but the
sketch's `submit()` was **`external` with no access control and no validation.** Anyone could
write any number for any `siteId`. The ledger was tamper-*evident* (history can't be edited)
but the data going *in* was completely unverified. The single most important word in the white
paper — *verified* — was not delivered by the code.

## Corrections applied (this repo)

| # | Severity | Original | Now |
| - | -------- | -------- | --- |
| 1 | **Critical** | `submit()` callable by anyone | **Site registry + operator allowlist.** `submit()` requires `msg.sender` to be the site's authorized operator. |
| 2 | **High** | No binding between a `siteId` and a real generator | `registerSite()` (owner-only) binds each site to an accredited operator address; `submit` reverts on unregistered sites. |
| 3 | **Medium** | No input validation | Reverts on `periodEnd <= periodStart` and on `energyWh == 0`. |
| 4 | **Medium** | "Corrections by linked adjustment" promised in §10 but the struct had no way to link one | Added `submitAdjustment()` + a `correctsIndex` field; the original is never modified, and cross-site corrections are rejected. |
| 5 | **Low** | Only `siteId/period/energy` stored | Added `submitter` and `submittedAt` for provenance/audit. |
| 6 | **Quality** | Hand-rolled, untested | OpenZeppelin `Ownable`, custom errors (gas-cheap, descriptive), NatSpec, and a **17-test** Hardhat suite. |

## Deliberately deferred (documented, not built)

To honour "ship the smallest useful version first," these remain optional v1.1+ modules in
[`technical-spec.md`](technical-spec.md#6-roadmap--optional-v11-modules):

- **EIP-712 signed / gasless readings** (operator signs off-chain; a paymaster relays). This
  is what makes the white paper's "operators pay nothing / never hold a token" claim fully
  real, and it composes cleanly with the registry.
- Multiple authorized keys per site.
- Renewable-energy-certificate (REC) module.
- Richer on-chain site metadata.

## Documentation reconciled

The white-paper wording was updated to match the code — the "verified" claim is now backed by
the registry, and the gasless-paymaster paragraph is explicitly labelled a v1.1 extension. See
[`WhitePaper.md`](WhitePaper.md). The original PDFs are left untouched; regenerating a styled
PDF from `WhitePaper.md` is the maintainer's step.
