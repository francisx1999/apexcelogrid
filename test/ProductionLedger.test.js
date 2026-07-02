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
