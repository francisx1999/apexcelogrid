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
const fs = require("fs");
const { ethers } = require("ethers");

const ABI = [
  "function registerSite(bytes32 siteId, address operator, string label) external",
  "function setOperator(bytes32 siteId, address newOperator) external",
  "function submit(bytes32 siteId, uint64 periodStart, uint64 periodEnd, uint256 energyWh) external returns (uint256)",
  "function submitBatch((bytes32 siteId, uint64 periodStart, uint64 periodEnd, uint256 energyWh)[] readings) external returns (uint256)",
  "function submitSigned(bytes32 siteId, uint64 periodStart, uint64 periodEnd, uint256 energyWh, uint256 deadline, bytes signature) external returns (uint256)",
  "function nonces(address) external view returns (uint256)",
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
  const rpc = process.env.RPC_URL || "https://forno.celo-sepolia.celo-testnet.org";
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
    case "batch": {
      // Read many readings from a JSON file and submit them in one transaction.
      // File format: [{ "site": "REA-Mokwa-01", "start": 1719792000, "end": 1719878400, "wh": 5000000 }, ...]
      const c = getContract(true);
      const file = required(args.file, "file");
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Array.isArray(raw) || raw.length === 0) {
        console.error("File must be a non-empty JSON array of readings.");
        process.exit(1);
      }
      const readings = raw.map((r, i) => {
        for (const k of ["site", "start", "end", "wh"]) {
          if (r[k] === undefined) {
            console.error(`Reading ${i} is missing "${k}"`);
            process.exit(1);
          }
        }
        return {
          siteId: toSiteId(r.site),
          periodStart: BigInt(r.start),
          periodEnd: BigInt(r.end),
          energyWh: BigInt(r.wh),
        };
      });
      const tx = await c.submitBatch(readings);
      console.log(`batch tx: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`recorded ${readings.length} readings (block ${receipt.blockNumber})`);
      break;
    }
    case "sign": {
      // Operator produces an EIP-712 signature OFF-CHAIN (no transaction, no gas).
      // The resulting JSON payload can be handed to any relayer to submit.
      const provider = getProvider();
      const address = required(process.env.CONTRACT_ADDRESS, "CONTRACT_ADDRESS (env)");
      const pk = required(process.env.PRIVATE_KEY, "PRIVATE_KEY (env)");
      const wallet = new ethers.Wallet(pk, provider);
      const c = new ethers.Contract(address, ABI, provider);

      const label = required(args.site, "site");
      const siteId = toSiteId(label);
      const periodStart = BigInt(required(args.start, "start"));
      const periodEnd = BigInt(required(args.end, "end"));
      const energyWh = BigInt(required(args.wh, "wh"));
      const nonce = await c.nonces(wallet.address);
      const deadline = args.deadline
        ? BigInt(args.deadline)
        : BigInt(Math.floor(Date.now() / 1000) + 86400); // default: valid 24h

      const net = await provider.getNetwork();
      const domain = {
        name: "ApexCeloGrid",
        version: "1",
        chainId: net.chainId,
        verifyingContract: address,
      };
      const types = {
        Reading: [
          { name: "siteId", type: "bytes32" },
          { name: "periodStart", type: "uint64" },
          { name: "periodEnd", type: "uint64" },
          { name: "energyWh", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = { siteId, periodStart, periodEnd, energyWh, nonce, deadline };
      const signature = await wallet.signTypedData(domain, types, value);

      const payload = {
        site: label,
        siteId,
        start: periodStart.toString(),
        end: periodEnd.toString(),
        wh: energyWh.toString(),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
        signer: wallet.address,
        signature,
      };
      const out = JSON.stringify(payload, null, 2);
      if (args.out) {
        fs.writeFileSync(args.out, out);
        console.log(`signed payload written to ${args.out} (share it with a relayer)`);
      } else {
        console.log(out);
      }
      break;
    }
    case "relay": {
      // Anyone can relay an operator-signed payload and pay the gas.
      // The recorded submitter is the operator, not the relayer.
      const c = getContract(true);
      const file = required(args.file, "file");
      const p = JSON.parse(fs.readFileSync(file, "utf8"));
      const siteId = p.siteId || toSiteId(required(p.site, "site (in payload)"));
      const tx = await c.submitSigned(
        siteId,
        BigInt(p.start),
        BigInt(p.end),
        BigInt(p.wh),
        BigInt(p.deadline),
        p.signature
      );
      console.log(`relay tx: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(
        `relayed reading for "${p.site || siteId}" on behalf of ${p.signer} (block ${receipt.blockNumber})`
      );
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
          "  batch    --file <readings.json>                              (operator, many at once)\n" +
          "  sign     --site <name> --start <unix> --end <unix> --wh <n> [--deadline <unix>] [--out <file>]\n" +
          "                                                               (operator, off-chain, gasless)\n" +
          "  relay    --file <signed-payload.json>                        (anyone; pays gas for the operator)\n" +
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
