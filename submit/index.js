#!/usr/bin/env node
// ApexCeloGrid submission tool — a tiny, open-source CLI.
//
// Two roles:
//   * The owner (accreditation authority) registers sites and their operators.
//   * An operator submits production readings for the site(s) it is authorized for.
//
// Configuration (via environment or a .env file in this folder):
//   RPC_URL           Celo RPC endpoint (default: Alfajores testnet)
//   PRIVATE_KEY       the signing key (owner key for register, operator key for submit)
//   CONTRACT_ADDRESS  deployed ProductionLedger address
//
// Usage:
//   node index.js register --site "REA-Mokwa-01" --operator 0xABC... --label "Mokwa mini-grid"
//   node index.js submit   --site "REA-Mokwa-01" --start 1719792000 --end 1719878400 --wh 5000000
//   node index.js total
//   node index.js get --index 0
//
// Reading is always free and needs no key; only register/submit send a transaction.
require("dotenv").config();
const { ethers } = require("ethers");

const ABI = [
  "function registerSite(bytes32 siteId, address operator, string label) external",
  "function setOperator(bytes32 siteId, address newOperator) external",
  "function submit(bytes32 siteId, uint64 periodStart, uint64 periodEnd, uint256 energyWh) external returns (uint256)",
  "function submitAdjustment(uint256 correctsIndex, bytes32 siteId, uint64 periodStart, uint64 periodEnd, uint256 energyWh) external returns (uint256)",
  "function total() external view returns (uint256)",
  "function siteOperator(bytes32) external view returns (address)",
  "function getRecord(uint256 index) external view returns (tuple(bytes32 siteId, uint64 periodStart, uint64 periodEnd, uint256 energyWh, address submitter, uint64 submittedAt, uint256 correctsIndex))",
];

// A siteId is bytes32. We derive it deterministically from a human label so that
// operators can use readable names ("REA-Mokwa-01") instead of raw hashes.
function toSiteId(label) {
  return ethers.encodeBytes32String(label);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key || !key.startsWith("--")) continue;
    out[key.slice(2)] = argv[i + 1];
  }
  return out;
}

function required(value, name) {
  if (value === undefined || value === "") {
    console.error(`Missing required --${name}`);
    process.exit(1);
  }
  return value;
}

function getProvider() {
  const rpc = process.env.RPC_URL || "https://alfajores-forno.celo-testnet.org";
  return new ethers.JsonRpcProvider(rpc);
}

function getContract(needsSigner) {
  const address = required(process.env.CONTRACT_ADDRESS, "CONTRACT_ADDRESS (env)");
  const provider = getProvider();
  if (!needsSigner) return new ethers.Contract(address, ABI, provider);
  const pk = required(process.env.PRIVATE_KEY, "PRIVATE_KEY (env)");
  const wallet = new ethers.Wallet(pk, provider);
  return new ethers.Contract(address, ABI, wallet);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (command) {
    case "register": {
      const c = getContract(true);
      const siteId = toSiteId(required(args.site, "site"));
      const operator = required(args.operator, "operator");
      const label = args.label || args.site;
      const tx = await c.registerSite(siteId, operator, label);
      console.log(`register tx: ${tx.hash}`);
      await tx.wait();
      console.log(`registered "${args.site}" -> operator ${operator}`);
      break;
    }
    case "submit": {
      const c = getContract(true);
      const siteId = toSiteId(required(args.site, "site"));
      const start = BigInt(required(args.start, "start"));
      const end = BigInt(required(args.end, "end"));
      const wh = BigInt(required(args.wh, "wh"));
      const tx = await c.submit(siteId, start, end, wh);
      console.log(`submit tx: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`recorded ${wh} Wh for "${args.site}" (block ${receipt.blockNumber})`);
      break;
    }
    case "adjust": {
      const c = getContract(true);
      const idx = BigInt(required(args.index, "index"));
      const siteId = toSiteId(required(args.site, "site"));
      const start = BigInt(required(args.start, "start"));
      const end = BigInt(required(args.end, "end"));
      const wh = BigInt(required(args.wh, "wh"));
      const tx = await c.submitAdjustment(idx, siteId, start, end, wh);
      console.log(`adjust tx: ${tx.hash}`);
      await tx.wait();
      console.log(`recorded adjustment to record #${idx}`);
      break;
    }
    case "total": {
      const c = getContract(false);
      console.log((await c.total()).toString());
      break;
    }
    case "get": {
      const c = getContract(false);
      const idx = BigInt(required(args.index, "index"));
      const r = await c.getRecord(idx);
      console.log(
        JSON.stringify(
          {
            index: idx.toString(),
            siteId: ethers.decodeBytes32String(r.siteId),
            periodStart: r.periodStart.toString(),
            periodEnd: r.periodEnd.toString(),
            energyWh: r.energyWh.toString(),
            submitter: r.submitter,
            submittedAt: r.submittedAt.toString(),
            correctsIndex:
              r.correctsIndex === ethers.MaxUint256 ? null : r.correctsIndex.toString(),
          },
          null,
          2
        )
      );
      break;
    }
    default:
      console.log(
        "ApexCeloGrid submission tool\n\n" +
          "Commands:\n" +
          "  register --site <name> --operator <0x..> [--label <text>]   (owner)\n" +
          "  submit   --site <name> --start <unix> --end <unix> --wh <n>  (operator)\n" +
          "  adjust   --index <n> --site <name> --start <unix> --end <unix> --wh <n>\n" +
          "  total\n" +
          "  get      --index <n>\n\n" +
          "Config via env / .env: RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS"
      );
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err.shortMessage || err.message || err);
  process.exit(1);
});
