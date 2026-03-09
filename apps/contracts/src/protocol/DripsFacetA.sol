// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {
    Streams, StreamReceiver
} from "./Streams.sol";
import {Managed} from "./Managed.sol";
import {Splits} from "./Splits.sol";
import {IERC20, SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;

/// @notice DripsFacetA — Streams + driver management + balance accounting.
/// Deployed behind DripsRouter alongside DripsFacetB.
contract DripsFacetA is Managed, Streams, Splits {
    uint256 public constant MAX_STREAMS_RECEIVERS = _MAX_STREAMS_RECEIVERS;
    uint8 public constant AMT_PER_SEC_EXTRA_DECIMALS = _AMT_PER_SEC_EXTRA_DECIMALS;
    uint160 public constant AMT_PER_SEC_MULTIPLIER = _AMT_PER_SEC_MULTIPLIER;
    uint128 public constant MAX_TOTAL_BALANCE = _MAX_STREAMS_BALANCE;
    uint8 public constant DRIVER_ID_OFFSET = 224;

    uint32 public immutable CYCLE_SECS;
    uint160 public immutable MIN_AMT_PER_SEC;
    bytes32 private immutable _DRIPS_STORAGE_SLOT = _erc1967Slot("eip1967.drips.storage");

    event DriverRegistered(uint32 indexed driverId, address indexed driverAddr);
    event DriverAddressUpdated(
        uint32 indexed driverId, address indexed oldDriverAddr, address indexed newDriverAddr
    );
    event Withdrawn(IERC20 indexed erc20, address indexed receiver, uint256 amt);

    struct DripsStorage {
        uint32 nextDriverId;
        mapping(uint32 driverId => address) driverAddresses;
        mapping(IERC20 erc20 => Balance) balances;
    }

    struct Balance {
        uint128 streams;
        uint128 splits;
    }

    constructor(uint32 cycleSecs_)
        Streams(cycleSecs_, _erc1967Slot("eip1967.streams.storage"))
        Splits(_erc1967Slot("eip1967.splits.storage"))
    {
        CYCLE_SECS = Streams._CYCLE_SECS;
        MIN_AMT_PER_SEC = Streams._MIN_AMT_PER_SEC;
    }

    modifier onlyDriver(uint256 accountId) {
        _onlyDriver(accountId);
        _;
    }

    function _onlyDriver(uint256 accountId) internal view {
        // upper 32 bits of accountId are driver ID
        // forge-lint: disable-next-line(unsafe-typecast)
        uint32 driverId = uint32(accountId >> DRIVER_ID_OFFSET);
        _assertCallerIsDriver(driverId);
    }

    function _assertCallerIsDriver(uint32 driverId) internal view {
        require(driverAddress(driverId) == msg.sender, "Callable only by the driver");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                        DRIVER MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    function registerDriver(address driverAddr) public whenNotPaused returns (uint32 driverId) {
        require(driverAddr != address(0), "Driver registered for 0 address");
        DripsStorage storage dripsStorage = _dripsStorage();
        driverId = dripsStorage.nextDriverId++;
        dripsStorage.driverAddresses[driverId] = driverAddr;
        emit DriverRegistered(driverId, driverAddr);
    }

    function driverAddress(uint32 driverId) public view returns (address driverAddr) {
        return _dripsStorage().driverAddresses[driverId];
    }

    function updateDriverAddress(uint32 driverId, address newDriverAddr) public whenNotPaused {
        _assertCallerIsDriver(driverId);
        _dripsStorage().driverAddresses[driverId] = newDriverAddr;
        emit DriverAddressUpdated(driverId, msg.sender, newDriverAddr);
    }

    function nextDriverId() public view returns (uint32 driverId) {
        return _dripsStorage().nextDriverId;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                        BALANCE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    function balances(IERC20 erc20)
        public
        view
        returns (uint128 streamsBalance, uint128 splitsBalance)
    {
        Balance storage balance = _dripsStorage().balances[erc20];
        return (balance.streams, balance.splits);
    }

    function withdraw(IERC20 erc20, address receiver, uint256 amt) public {
        (uint128 streamsBalance, uint128 splitsBalance) = balances(erc20);
        uint256 withdrawable = erc20.balanceOf(address(this)) - streamsBalance - splitsBalance;
        require(amt <= withdrawable, "Withdrawal amount too high");
        emit Withdrawn(erc20, receiver, amt);
        erc20.safeTransfer(receiver, amt);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                        STREAMS
    // ═══════════════════════════════════════════════════════════════════════════

    function receiveStreams(uint256 accountId, IERC20 erc20, uint32 maxCycles)
        public
        whenNotPaused
        returns (uint128 receivedAmt)
    {
        receivedAmt = Streams._receiveStreams(accountId, erc20, maxCycles);
        if (receivedAmt != 0) {
            Balance storage bal = _dripsStorage().balances[erc20];
            bal.streams -= receivedAmt;
            bal.splits += receivedAmt;
            Splits._addSplittable(accountId, erc20, receivedAmt);
        }
    }

    function streamsState(uint256 accountId, IERC20 erc20)
        public
        view
        returns (
            bytes32 streamsHash,
            bytes32 streamsHistoryHash,
            uint32 updateTime,
            uint128 balance,
            uint32 maxEnd
        )
    {
        return Streams._streamsState(accountId, erc20);
    }

    function setStreams(
        uint256 accountId,
        IERC20 erc20,
        StreamReceiver[] memory currReceivers,
        int128 balanceDelta,
        StreamReceiver[] memory newReceivers,
        uint32 maxEndHint1,
        uint32 maxEndHint2
    ) public whenNotPaused onlyDriver(accountId) returns (int128 realBalanceDelta) {
        if (balanceDelta > 0) {
            // balanceDelta > 0 check ensures safe cast
            // forge-lint: disable-next-line(unsafe-typecast)
            uint128 amt = uint128(balanceDelta);
            _verifyBalanceIncrease(erc20, amt);
            _dripsStorage().balances[erc20].streams += amt;
        }
        realBalanceDelta = Streams._setStreams(
            accountId, erc20, currReceivers, balanceDelta, newReceivers, maxEndHint1, maxEndHint2
        );
        if (realBalanceDelta < 0) {
            // realBalanceDelta < 0 ensures negation fits in uint128
            // forge-lint: disable-next-line(unsafe-typecast)
            _dripsStorage().balances[erc20].streams -= uint128(-realBalanceDelta);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                        INTERNAL
    // ═══════════════════════════════════════════════════════════════════════════

    function _verifyBalanceIncrease(IERC20 erc20, uint128 amt) internal view {
        Balance storage balance = _dripsStorage().balances[erc20];
        uint256 newTotalBalance = uint256(balance.streams) + balance.splits + amt;
        require(newTotalBalance <= MAX_TOTAL_BALANCE, "Total balance too high");
        require(newTotalBalance <= erc20.balanceOf(address(this)), "Token balance too low");
    }

    function _dripsStorage() internal view returns (DripsStorage storage storageRef) {
        bytes32 slot = _DRIPS_STORAGE_SLOT;
        assembly {
            storageRef.slot := slot
        }
    }
}
