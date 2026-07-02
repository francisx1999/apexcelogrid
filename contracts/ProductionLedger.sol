// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ProductionLedger
/// @notice An open, append-only, public record of verified electricity generation
///         in Nigeria. Each record states that a registered site produced a given
///         amount of energy over a given time window. Records can never be edited or
///         deleted; corrections are made by appending a linked adjustment.
/// @dev v1 trust model: a site registry with a per-site authorized operator. Only the
///      operator authorized for a `siteId` may submit records for it, which is what
///      makes the data "verified" rather than a public bulletin board. A future v1.1
///      may add EIP-712 signed readings so anyone can relay an operator's signed data
///      (enabling gasless submission via a paymaster) — see docs/technical-spec.md.
contract ProductionLedger is Ownable {
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

    /// @notice All production records, in submission order. Append-only.
    Record[] public records;

    /// @notice The address authorized to submit records for a given site.
    ///         address(0) means the site is not registered.
    mapping(bytes32 => address) public siteOperator;

    /// @notice Optional human-readable label for a site (e.g. "REA-Mokwa-01").
    mapping(bytes32 => string) public siteLabel;

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

    error SiteAlreadyRegistered(bytes32 siteId);
    error SiteNotRegistered(bytes32 siteId);
    error NotSiteOperator(bytes32 siteId, address caller);
    error ZeroOperator();
    error InvalidPeriod(uint64 periodStart, uint64 periodEnd);
    error ZeroEnergy();
    error BadCorrectionIndex(uint256 correctsIndex);
    error SiteMismatch(uint256 correctsIndex);

    constructor(address initialOwner) Ownable(initialOwner) {}

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
        if (periodEnd <= periodStart) revert InvalidPeriod(periodStart, periodEnd);
        if (energyWh == 0) revert ZeroEnergy();

        index = records.length;
        records.push(
            Record({
                siteId: siteId,
                periodStart: periodStart,
                periodEnd: periodEnd,
                energyWh: energyWh,
                submitter: msg.sender,
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
