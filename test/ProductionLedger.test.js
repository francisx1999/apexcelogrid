const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// A siteId is any bytes32; we derive readable ones from a label.
const site = (label) => ethers.encodeBytes32String(label);

const NO_CORRECTION = ethers.MaxUint256;

describe("ProductionLedger", function () {
  let ledger, owner, operator, other;
  const SITE = site("REA-Mokwa-01");

  beforeEach(async function () {
    [owner, operator, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ProductionLedger");
    ledger = await Factory.deploy(owner.address);
    await ledger.waitForDeployment();
  });

  describe("registry / access control", function () {
    it("lets the owner register a site and set its operator", async function () {
      await expect(ledger.registerSite(SITE, operator.address, "Mokwa mini-grid"))
        .to.emit(ledger, "SiteRegistered")
        .withArgs(SITE, operator.address, "Mokwa mini-grid");
      expect(await ledger.siteOperator(SITE)).to.equal(operator.address);
      expect(await ledger.isRegistered(SITE)).to.equal(true);
    });

    it("rejects registration from a non-owner", async function () {
      await expect(
        ledger.connect(other).registerSite(SITE, operator.address, "x")
      ).to.be.revertedWithCustomError(ledger, "OwnableUnauthorizedAccount");
    });

    it("rejects a zero-address operator", async function () {
      await expect(
        ledger.registerSite(SITE, ethers.ZeroAddress, "x")
      ).to.be.revertedWithCustomError(ledger, "ZeroOperator");
    });

    it("rejects double registration of the same site", async function () {
      await ledger.registerSite(SITE, operator.address, "x");
      await expect(
        ledger.registerSite(SITE, other.address, "y")
      ).to.be.revertedWithCustomError(ledger, "SiteAlreadyRegistered");
    });

    it("lets the owner rotate the operator", async function () {
      await ledger.registerSite(SITE, operator.address, "x");
      await expect(ledger.setOperator(SITE, other.address))
        .to.emit(ledger, "OperatorChanged")
        .withArgs(SITE, operator.address, other.address);
      expect(await ledger.siteOperator(SITE)).to.equal(other.address);
    });

    it("cannot set operator on an unregistered site", async function () {
      await expect(
        ledger.setOperator(SITE, other.address)
      ).to.be.revertedWithCustomError(ledger, "SiteNotRegistered");
    });
  });

  describe("submit", function () {
    beforeEach(async function () {
      await ledger.registerSite(SITE, operator.address, "Mokwa mini-grid");
    });

    it("records a valid reading from the authorized operator", async function () {
      await expect(ledger.connect(operator).submit(SITE, 1000, 2000, 5_000_000))
        .to.emit(ledger, "Recorded")
        .withArgs(SITE, 1000, 2000, 5_000_000, 0, NO_CORRECTION);

      expect(await ledger.total()).to.equal(1);
      const r = await ledger.getRecord(0);
      expect(r.siteId).to.equal(SITE);
      expect(r.energyWh).to.equal(5_000_000);
      expect(r.submitter).to.equal(operator.address);
      expect(r.correctsIndex).to.equal(NO_CORRECTION);
    });

    it("rejects submissions from anyone but the site operator", async function () {
      await expect(
        ledger.connect(other).submit(SITE, 1000, 2000, 5_000_000)
      ).to.be.revertedWithCustomError(ledger, "NotSiteOperator");
      // even the owner cannot submit unless they are the operator
      await expect(
        ledger.connect(owner).submit(SITE, 1000, 2000, 5_000_000)
      ).to.be.revertedWithCustomError(ledger, "NotSiteOperator");
    });

    it("rejects submissions for an unregistered site", async function () {
      await expect(
        ledger.connect(operator).submit(site("ghost"), 1000, 2000, 1)
      ).to.be.revertedWithCustomError(ledger, "SiteNotRegistered");
    });

    it("rejects an invalid period (end <= start)", async function () {
      await expect(
        ledger.connect(operator).submit(SITE, 2000, 2000, 1)
      ).to.be.revertedWithCustomError(ledger, "InvalidPeriod");
      await expect(
        ledger.connect(operator).submit(SITE, 2000, 1000, 1)
      ).to.be.revertedWithCustomError(ledger, "InvalidPeriod");
    });

    it("rejects zero energy", async function () {
      await expect(
        ledger.connect(operator).submit(SITE, 1000, 2000, 0)
      ).to.be.revertedWithCustomError(ledger, "ZeroEnergy");
    });

    it("assigns increasing indices", async function () {
      await ledger.connect(operator).submit(SITE, 1000, 2000, 10);
      await ledger.connect(operator).submit(SITE, 2000, 3000, 20);
      await ledger.connect(operator).submit(SITE, 3000, 4000, 30);
      expect(await ledger.total()).to.equal(3);
      expect((await ledger.getRecord(2)).energyWh).to.equal(30);
    });
  });

  describe("submitBatch", function () {
    const SITE2 = site("REA-Bida-02");
    beforeEach(async function () {
      await ledger.registerSite(SITE, operator.address, "Mokwa");
      await ledger.registerSite(SITE2, operator.address, "Bida");
    });

    it("records many readings, possibly across sites, in one tx", async function () {
      const readings = [
        { siteId: SITE, periodStart: 1000, periodEnd: 2000, energyWh: 10 },
        { siteId: SITE2, periodStart: 1000, periodEnd: 2000, energyWh: 20 },
        { siteId: SITE, periodStart: 2000, periodEnd: 3000, energyWh: 30 },
      ];
      await ledger.connect(operator).submitBatch(readings);
      expect(await ledger.total()).to.equal(3);
      expect((await ledger.getRecord(1)).siteId).to.equal(SITE2);
      expect((await ledger.getRecord(2)).energyWh).to.equal(30);
    });

    it("reverts the whole batch if any reading is unauthorized or invalid", async function () {
      // second reading is for a site `other` does not operate
      const readings = [
        { siteId: SITE, periodStart: 1000, periodEnd: 2000, energyWh: 10 },
      ];
      await expect(
        ledger.connect(other).submitBatch(readings)
      ).to.be.revertedWithCustomError(ledger, "NotSiteOperator");
      // an invalid reading anywhere reverts everything (atomic) -> nothing stored
      const withBad = [
        { siteId: SITE, periodStart: 1000, periodEnd: 2000, energyWh: 10 },
        { siteId: SITE, periodStart: 5000, periodEnd: 5000, energyWh: 5 }, // bad period
      ];
      await expect(
        ledger.connect(operator).submitBatch(withBad)
      ).to.be.revertedWithCustomError(ledger, "InvalidPeriod");
      expect(await ledger.total()).to.equal(0);
    });

    it("rejects an empty batch", async function () {
      await expect(
        ledger.connect(operator).submitBatch([])
      ).to.be.revertedWithCustomError(ledger, "EmptyBatch");
    });
  });

  describe("submitAdjustment", function () {
    beforeEach(async function () {
      await ledger.registerSite(SITE, operator.address, "Mokwa mini-grid");
      await ledger.connect(operator).submit(SITE, 1000, 2000, 5_000_000);
    });

    it("links a correction to the original without editing it", async function () {
      await expect(ledger.connect(operator).submitAdjustment(0, SITE, 1000, 2000, 4_800_000))
        .to.emit(ledger, "Recorded")
        .withArgs(SITE, 1000, 2000, 4_800_000, 1, 0);

      // original is untouched
      expect((await ledger.getRecord(0)).energyWh).to.equal(5_000_000);
      // adjustment points back at it
      const adj = await ledger.getRecord(1);
      expect(adj.energyWh).to.equal(4_800_000);
      expect(adj.correctsIndex).to.equal(0);
    });

    it("rejects an out-of-range correction index", async function () {
      await expect(
        ledger.connect(operator).submitAdjustment(99, SITE, 1000, 2000, 1)
      ).to.be.revertedWithCustomError(ledger, "BadCorrectionIndex");
    });

    it("rejects correcting a record that belongs to a different site", async function () {
      const OTHER_SITE = site("REA-Bida-02");
      await ledger.registerSite(OTHER_SITE, operator.address, "Bida");
      await expect(
        ledger.connect(operator).submitAdjustment(0, OTHER_SITE, 1000, 2000, 1)
      ).to.be.revertedWithCustomError(ledger, "SiteMismatch");
    });

    it("still enforces operator authorization on adjustments", async function () {
      await expect(
        ledger.connect(other).submitAdjustment(0, SITE, 1000, 2000, 1)
      ).to.be.revertedWithCustomError(ledger, "NotSiteOperator");
    });
  });

  describe("submitSigned (EIP-712 gasless)", function () {
    let chainId, ledgerAddress;
    const FAR_FUTURE = 4000000000; // year 2096
    const SITE_TYPES = {
      Reading: [
        { name: "siteId", type: "bytes32" },
        { name: "periodStart", type: "uint64" },
        { name: "periodEnd", type: "uint64" },
        { name: "energyWh", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    beforeEach(async function () {
      await ledger.registerSite(SITE, operator.address, "Mokwa");
      chainId = (await ethers.provider.getNetwork()).chainId;
      ledgerAddress = await ledger.getAddress();
    });

    function domain() {
      return { name: "ApexCeloGrid", version: "1", chainId, verifyingContract: ledgerAddress };
    }

    async function sign(signer, reading) {
      return signer.signTypedData(domain(), SITE_TYPES, reading);
    }

    it("lets a relayer submit an operator-signed reading; operator is the recorded submitter", async function () {
      const reading = {
        siteId: SITE,
        periodStart: 1000,
        periodEnd: 2000,
        energyWh: 5_000_000,
        nonce: 0,
        deadline: FAR_FUTURE,
      };
      const sig = await sign(operator, reading);

      // `other` acts as the gasless relayer and pays the gas.
      await expect(
        ledger
          .connect(other)
          .submitSigned(SITE, 1000, 2000, 5_000_000, FAR_FUTURE, sig)
      )
        .to.emit(ledger, "RelayedSubmission")
        .withArgs(SITE, other.address, operator.address, 0)
        .and.to.emit(ledger, "Recorded")
        .withArgs(SITE, 1000, 2000, 5_000_000, 0, NO_CORRECTION);

      const r = await ledger.getRecord(0);
      expect(r.submitter).to.equal(operator.address); // NOT the relayer
      expect(await ledger.nonces(operator.address)).to.equal(1);
    });

    it("rejects a replay of the same signature (nonce consumed)", async function () {
      const reading = { siteId: SITE, periodStart: 1000, periodEnd: 2000, energyWh: 10, nonce: 0, deadline: FAR_FUTURE };
      const sig = await sign(operator, reading);
      await ledger.connect(other).submitSigned(SITE, 1000, 2000, 10, FAR_FUTURE, sig);
      await expect(
        ledger.connect(other).submitSigned(SITE, 1000, 2000, 10, FAR_FUTURE, sig)
      ).to.be.revertedWithCustomError(ledger, "NotSiteOperator");
    });

    it("rejects a signature from someone who is not the site operator", async function () {
      const reading = { siteId: SITE, periodStart: 1000, periodEnd: 2000, energyWh: 10, nonce: 0, deadline: FAR_FUTURE };
      const sig = await sign(other, reading); // `other` is not the operator
      await expect(
        ledger.connect(other).submitSigned(SITE, 1000, 2000, 10, FAR_FUTURE, sig)
      ).to.be.revertedWithCustomError(ledger, "NotSiteOperator");
    });

    it("rejects an expired signature", async function () {
      const reading = { siteId: SITE, periodStart: 1000, periodEnd: 2000, energyWh: 10, nonce: 0, deadline: 1 };
      const sig = await sign(operator, reading);
      await expect(
        ledger.connect(other).submitSigned(SITE, 1000, 2000, 10, 1, sig)
      ).to.be.revertedWithCustomError(ledger, "SignatureExpired");
    });

    it("rejects tampered fields (energy changed after signing)", async function () {
      const reading = { siteId: SITE, periodStart: 1000, periodEnd: 2000, energyWh: 10, nonce: 0, deadline: FAR_FUTURE };
      const sig = await sign(operator, reading);
      // relayer tries to inflate energy to 999 — recovers a different signer, reverts
      await expect(
        ledger.connect(other).submitSigned(SITE, 1000, 2000, 999, FAR_FUTURE, sig)
      ).to.be.revertedWithCustomError(ledger, "NotSiteOperator");
    });

    it("still validates the reading (zero energy) on the signed path", async function () {
      const reading = { siteId: SITE, periodStart: 1000, periodEnd: 2000, energyWh: 0, nonce: 0, deadline: FAR_FUTURE };
      const sig = await sign(operator, reading);
      await expect(
        ledger.connect(other).submitSigned(SITE, 1000, 2000, 0, FAR_FUTURE, sig)
      ).to.be.revertedWithCustomError(ledger, "ZeroEnergy");
      // failed submit did not consume the nonce
      expect(await ledger.nonces(operator.address)).to.equal(0);
    });

    it("rejects a signed reading for an unregistered site", async function () {
      const GHOST = site("ghost");
      const reading = { siteId: GHOST, periodStart: 1000, periodEnd: 2000, energyWh: 10, nonce: 0, deadline: FAR_FUTURE };
      const sig = await sign(operator, reading);
      await expect(
        ledger.connect(other).submitSigned(GHOST, 1000, 2000, 10, FAR_FUTURE, sig)
      ).to.be.revertedWithCustomError(ledger, "SiteNotRegistered");
    });
  });

  describe("property: many valid readings accumulate faithfully", function () {
    it("stores every accepted reading and count matches", async function () {
      await ledger.registerSite(SITE, operator.address, "Mokwa");
      let expectedTotal = 0n;
      for (let i = 0; i < 25; i++) {
        const start = 1000 + i * 100;
        const wh = BigInt((i + 1) * 137);
        await ledger.connect(operator).submit(SITE, start, start + 100, wh);
        expectedTotal += wh;
      }
      expect(await ledger.total()).to.equal(25);
      let sum = 0n;
      for (let i = 0; i < 25; i++) sum += (await ledger.getRecord(i)).energyWh;
      expect(sum).to.equal(expectedTotal);
    });
  });
});
