// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title ProductionLedger
/// @notice An open, append-only, public record of verified electricity generation
///         in Nigeria. Each record states that a registered site produced a given
///         amount of energy over a given time window. Records can never be edited or
///         deleted; corrections are made by appending a linked adjustment.
/// @dev Trust model: a site registry with a per-site authorized operator. Only that
///      operator may record data for a `siteId`, which is what makes the data "verified"
///      rather than a public bulletin board. Authorization is proven in one of two ways:
///        1. Directly — the operator sends the transaction (`submit` / `submitBatch` /
///           `submitAdjustment`), so `msg.sender` must be the operator.
///        2. By EIP-712 signature — the operator signs a reading off-chain and anyone
///           (e.g. a paymaster/relayer) submits it (`submitSigned`). The recorded
///           submitter is the operator, not the relayer. Replay is prevented by a
///           per-operator sequential nonce plus a signature deadline. This enables
///           gasless submission so an operator never needs to hold a token.
contract ProductionLedger is Ownable, EIP712 {
    using ECDSA for bytes32;

    /// @notice Sentinel meaning "this record is an original, not a correction".
    uint256 internal constant NO_CORRECTION = type(uint256).max;

    struct Record {
        bytes32 siteId; // which registered generation site produced the power
        uint64 periodStart; // unix seconds: start of the covered window (inclusive)
        uint64 periodEnd; // unix seconds: end of the covered window (exclusive)
        uint256 energyWh; // energy produced in the window, whole watt-hours, no rounding
        address submitter; // the operator address that recorded it
        uint64 submittedAt; // unix seconds the record was written on-chain
        uint256 correctsIndex; // index this record adjusts, or NO_CORRECTION if original
    }

    /// @notice A single reading, used for batch submission. Same fields as an original record.
    struct Reading {
        bytes32 siteId;
        uint64 periodStart;
        uint64 periodEnd;
        uint256 energyWh;
    }

    /// @notice All production records, in submission order. Append-only.
    Record[] public records;

    /// @notice The address authorized to submit records for a given site.
    ///         address(0) means the site is not registered.
    mapping(bytes32 => address) public siteOperator;

    /// @notice Optional human-readable label for a site (e.g. "REA-Mokwa-01").
    mapping(bytes32 => string) public siteLabel;

    /// @notice Next expected signature nonce for each operator address (replay protection
    ///         for `submitSigned`). Sequential per operator, across all sites they operate.
    mapping(address => uint256) public nonces;

    /// @dev EIP-712 type hash for a signed reading.
    bytes32 private constant READING_TYPEHASH = keccak256(
        "Reading(bytes32 siteId,uint64 periodStart,uint64 periodEnd,uint256 energyWh,uint256 nonce,uint256 deadline)"
    );

    event SiteRegistered(bytes32 indexed siteId, address indexed operator, string label);
    event OperatorChanged(bytes32 indexed siteId, address indexed oldOperator, address indexed newOperator);
    event Recorded(
        bytes32 indexed siteId,
        uint64 periodStart,
        uint64 periodEnd,
        uint256 energyWh,
        uint256 indexed index,
        uint256 correctsIndex
    );
    /// @notice Emitted when a record is submitted by a relayer on an operator's behalf.
    event RelayedSubmission(
        bytes32 indexed siteId, address indexed relayer, address indexed operator, uint256 index
    );

    error SiteAlreadyRegistered(bytes32 siteId);
    error SiteNotRegistered(bytes32 siteId);
    error NotSiteOperator(bytes32 siteId, address caller);
    error ZeroOperator();
    error InvalidPeriod(uint64 periodStart, uint64 periodEnd);
    error ZeroEnergy();
    error BadCorrectionIndex(uint256 correctsIndex);
    error SiteMismatch(uint256 correctsIndex);
    error EmptyBatch();
    error SignatureExpired(uint256 deadline);

    /// @param initialOwner the accreditation authority (ideally a governance multisig).
    /// @dev The EIP-712 domain is ("ApexCeloGrid", "1"); off-chain signers must match it.
    constructor(address initialOwner) Ownable(initialOwner) EIP712("ApexCeloGrid", "1") {}

    // ---------------------------------------------------------------------
    // Registry (owner / governance controlled)
    // ---------------------------------------------------------------------

    /// @notice Register a site and authorize its operator. Owner only.
    /// @dev In production the owner is a lightweight multi-stakeholder governance
    ///      address responsible only for accreditation (see white paper §10).
    function registerSite(bytes32 siteId, address operator, string calldata label) external onlyOwner {
        if (operator == address(0)) revert ZeroOperator();
        if (siteOperator[siteId] != address(0)) revert SiteAlreadyRegistered(siteId);
        siteOperator[siteId] = operator;
        siteLabel[siteId] = label;
        emit SiteRegistered(siteId, operator, label);
    }

    /// @notice Change (or revoke, via a new address) the operator for a registered site.
    ///         Owner only. Does not affect existing records.
    function setOperator(bytes32 siteId, address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroOperator();
        address current = siteOperator[siteId];
        if (current == address(0)) revert SiteNotRegistered(siteId);
        siteOperator[siteId] = newOperator;
        emit OperatorChanged(siteId, current, newOperator);
    }

    // ---------------------------------------------------------------------
    // Submission (authorized operators only)
    // ---------------------------------------------------------------------

    /// @notice Record an original production reading for a site.
    /// @param siteId       registered site that produced the power
    /// @param periodStart  unix seconds, start of window (inclusive)
    /// @param periodEnd    unix seconds, end of window (exclusive), must be > periodStart
    /// @param energyWh     whole watt-hours produced in the window, must be > 0
    /// @return index       the index of the newly appended record
    function submit(bytes32 siteId, uint64 periodStart, uint64 periodEnd, uint256 energyWh)
        external
        returns (uint256 index)
    {
        return _append(siteId, periodStart, periodEnd, energyWh, NO_CORRECTION);
    }

    /// @notice Record several original readings in one transaction.
    /// @dev Convenience for operators reporting many sites/periods at once (e.g. a full
    ///      day). Each reading is authorized and validated individually via `_append`, so a
    ///      batch may span any sites the caller operates. The loop is bounded only by the
    ///      operator's own gas — it is permissioned, so there is no griefing surface.
    /// @return firstIndex the index of the first appended record; the batch occupies
    ///         [firstIndex, firstIndex + readings.length).
    function submitBatch(Reading[] calldata readings) external returns (uint256 firstIndex) {
        uint256 n = readings.length;
        if (n == 0) revert EmptyBatch();
        firstIndex = records.length;
        for (uint256 i = 0; i < n; i++) {
            Reading calldata r = readings[i];
            _append(r.siteId, r.periodStart, r.periodEnd, r.energyWh, NO_CORRECTION);
        }
    }

    /// @notice Append a correction that adjusts an earlier record for the same site.
    ///         The original is never modified; the adjustment is linked to it.
    /// @param correctsIndex index of the record being corrected
    function submitAdjustment(
        uint256 correctsIndex,
        bytes32 siteId,
        uint64 periodStart,
        uint64 periodEnd,
        uint256 energyWh
    ) external returns (uint256 index) {
        if (correctsIndex >= records.length) revert BadCorrectionIndex(correctsIndex);
        if (records[correctsIndex].siteId != siteId) revert SiteMismatch(correctsIndex);
        return _append(siteId, periodStart, periodEnd, energyWh, correctsIndex);
    }

    // ---------------------------------------------------------------------
    // Gasless submission (EIP-712 signed by the operator, relayed by anyone)
    // ---------------------------------------------------------------------

    /// @notice Record an original reading that the site's operator signed off-chain.
    ///         Anyone (typically a paymaster/relayer) may call this and pay the gas; the
    ///         recorded submitter is the operator, not the caller.
    /// @dev The signature covers a `Reading(bytes32 siteId,uint64 periodStart,uint64
    ///      periodEnd,uint256 energyWh,uint256 nonce,uint256 deadline)` under this
    ///      contract's EIP-712 domain. `nonce` must equal the operator's current `nonces`
    ///      value (checked implicitly: a wrong nonce recovers a different signer and
    ///      reverts), giving strong replay protection. `deadline` bounds how long the
    ///      signature is valid.
    /// @param deadline   unix seconds after which the signature is rejected
    /// @param signature  the operator's 65-byte EIP-712 signature
    /// @return index      the index of the newly appended record
    function submitSigned(
        bytes32 siteId,
        uint64 periodStart,
        uint64 periodEnd,
        uint256 energyWh,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 index) {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        address operator = siteOperator[siteId];
        if (operator == address(0)) revert SiteNotRegistered(siteId);

        uint256 nonce = nonces[operator];
        bytes32 structHash =
            keccak256(abi.encode(READING_TYPEHASH, siteId, periodStart, periodEnd, energyWh, nonce, deadline));
        address signer = _hashTypedDataV4(structHash).recover(signature);
        if (signer != operator) revert NotSiteOperator(siteId, signer);

        // Consume the nonce before storing; a revert in `_store` rolls this back.
        unchecked {
            nonces[operator] = nonce + 1;
        }
        index = _store(siteId, periodStart, periodEnd, energyWh, operator, NO_CORRECTION);
        emit RelayedSubmission(siteId, msg.sender, operator, index);
    }

    // ---------------------------------------------------------------------
    // Internal storage / authorization helpers
    // ---------------------------------------------------------------------

    /// @dev Direct path: the caller must be the site's authorized operator.
    function _append(
        bytes32 siteId,
        uint64 periodStart,
        uint64 periodEnd,
        uint256 energyWh,
        uint256 correctsIndex
    ) internal returns (uint256 index) {
        address operator = siteOperator[siteId];
        if (operator == address(0)) revert SiteNotRegistered(siteId);
        if (msg.sender != operator) revert NotSiteOperator(siteId, msg.sender);
        return _store(siteId, periodStart, periodEnd, energyWh, msg.sender, correctsIndex);
    }

    /// @dev Validates and appends a record. Callers MUST have already authorized the
    ///      `submitter` for `siteId` (directly via msg.sender, or via signature).
    function _store(
        bytes32 siteId,
        uint64 periodStart,
        uint64 periodEnd,
        uint256 energyWh,
        address submitter,
        uint256 correctsIndex
    ) internal returns (uint256 index) {
        if (periodEnd <= periodStart) revert InvalidPeriod(periodStart, periodEnd);
        if (energyWh == 0) revert ZeroEnergy();

        index = records.length;
        records.push(
            Record({
                siteId: siteId,
                periodStart: periodStart,
                periodEnd: periodEnd,
                energyWh: energyWh,
                submitter: submitter,
                submittedAt: uint64(block.timestamp),
                correctsIndex: correctsIndex
            })
        );
        emit Recorded(siteId, periodStart, periodEnd, energyWh, index, correctsIndex);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Total number of records ever submitted (including adjustments).
    function total() external view returns (uint256) {
        return records.length;
    }

    /// @notice Whether a site is registered.
    function isRegistered(bytes32 siteId) external view returns (bool) {
        return siteOperator[siteId] != address(0);
    }

    /// @notice Convenience getter returning a full record by index.
    function getRecord(uint256 index) external view returns (Record memory) {
        return records[index];
    }
}
