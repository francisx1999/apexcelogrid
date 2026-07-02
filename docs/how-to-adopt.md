# How to adopt ApexCeloGrid

ApexCeloGrid is a gift to the country. The author's role ends at "published and
documented." From here, **anyone** — a mini-grid operator, a state agency, the REA, a
university, or a developer — can adopt or fork it and run it for their community.

## Three ways to adopt

### 1. Read from the public ledger (zero setup)
If someone has already deployed ApexCeloGrid, you just read it. Open `web/index.html`,
paste the contract address, and view every record. Free, forever, no login.

### 2. Become a submitting operator
Ask the deployment's owner/governance to register your site
(`registerSite(siteId, yourOperatorAddress, label)`). Then submit your daily production
with the `submit/` CLI. You never hold a token beyond a little CELO for sub-cent gas — and a
future v1.1 paymaster can sponsor even that.

### 3. Run your own instance (fork)
1. Fork this repository.
2. `npm install && npm test` to confirm everything passes.
3. Decide your **governance owner** — ideally a multisig including a regulator/REA
   representative, an operator association, and an independent maintainer.
4. Deploy (`npm run deploy:celo`) and transfer ownership to that multisig.
5. Register your first cohort of sites and publish the contract address on your website.

## Keep it simple

The guiding principle is **"ship the smallest useful version first."** Resist adding
modules (RECs, richer metadata, multi-key sites, gasless relaying) until real adoption
demands them — every one of those is an optional extension documented in
[`technical-spec.md`](technical-spec.md), not a prerequisite.

## Governance, briefly

- **Read access** is open and permissionless by design.
- **Production records** can never be edited or deleted — corrections are appended.
- The **only** governed action is **accreditation**: deciding which sites and operator keys
  are legitimate. Keep that group small, multi-stakeholder, and transparent.

## The one ask

Whoever adopts, forks, or builds on ApexCeloGrid is asked to do one thing in return:
**use it to help the people of Nigeria.**
