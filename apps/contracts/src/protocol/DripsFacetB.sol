// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {Managed} from "./Managed.sol";
import {Splits, SplitsReceiver} from "./Splits.sol";
import {IERC20, SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;

/// @notice Interface for YieldManager contract
interface IYieldManager {
    function dripsForceWithdraw(
        uint256 senderAccountId,
        uint256 accountId,
        IERC20 token,
        address strategy,
        uint128 amount,
        address transferTo
    ) external;
}

/// @notice The account metadata.
struct AccountMetadata {
    bytes32 key;
    bytes value;
}

/// @notice DripsFacetB — Splits + give + collect + metadata.
/// Deployed behind DripsRouter alongside DripsFacetA.
contract DripsFacetB is Managed, Splits {
    uint256 public constant MAX_SPLITS_RECEIVERS = _MAX_SPLITS_RECEIVERS;
    uint32 public constant TOTAL_SPLITS_WEIGHT = _TOTAL_SPLITS_WEIGHT;
    uint128 public constant MAX_TOTAL_BALANCE = uint128(type(int128).max);
    uint8 public constant DRIVER_ID_OFFSET = 224;

    bytes32 private immutable _DRIPS_STORAGE_SLOT = _erc1967Slot("eip1967.drips.storage");

    event AccountMetadataEmitted(uint256 indexed accountId, bytes32 indexed key, bytes value);

    struct DripsStorage {
        uint32 nextDriverId;
        mapping(uint32 driverId => address) driverAddresses;
        mapping(IERC20 erc20 => Balance) balances;
    }

    struct Balance {
        uint128 streams;
        uint128 splits;
    }

    constructor()
        Splits(_erc1967Slot("eip1967.splits.storage"))
    {}

    modifier onlyDriver(uint256 accountId) {
        _onlyDriver(accountId);
        _;
    }

    function _onlyDriver(uint256 accountId) internal view {
        // upper 32 bits of accountId are driver ID
        // forge-lint: disable-next-line(unsafe-typecast)
        uint32 driverId = uint32(accountId >> DRIVER_ID_OFFSET);
        require(_dripsStorage().driverAddresses[driverId] == msg.sender, "Callable only by the driver");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                        SPLITS
    // ═══════════════════════════════════════════════════════════════════════════

    function splittable(uint256 accountId, IERC20 erc20) public view returns (uint128 amt) {
        return Splits._splittable(accountId, erc20);
    }

    function split(uint256 accountId, IERC20 erc20, SplitsReceiver[] memory currReceivers)
        public
        whenNotPaused
        returns (uint128 collectableAmt, uint128 splitAmt)
    {
        return Splits._split(accountId, erc20, currReceivers);
    }

    function collectable(uint256 accountId, IERC20 erc20) public view returns (uint128 amt) {
        return Splits._collectable(accountId, erc20);
    }

    function collect(uint256 accountId, IERC20 erc20)
        public
        whenNotPaused
        onlyDriver(accountId)
        returns (uint128 amt)
    {
        uint128 collectableAmt = Splits._collectable(accountId, erc20);
        if (collectableAmt > 0) {
            require(
                erc20.balanceOf(address(this)) >= collectableAmt,
                "Insufficient vault balance. Use forceCollect to withdraw from YieldManager"
            );
        }
        amt = Splits._collect(accountId, erc20);
        if (amt != 0) _dripsStorage().balances[erc20].splits -= amt;
    }

    function forceCollect(
        uint256 accountId,
        IERC20 erc20,
        address yieldManager,
        address strategy,
        uint256 senderAccountId,
        address transferTo
    )
        public
        whenNotPaused
        onlyDriver(accountId)
        returns (uint128 amt)
    {
        uint128 collectableAmt = Splits._collectable(accountId, erc20);
        uint256 heldBalance = erc20.balanceOf(address(this));
        require(heldBalance < collectableAmt, "Use normal collect");
        amt = Splits._collect(accountId, erc20);
        if (amt != 0) _dripsStorage().balances[erc20].splits -= amt;
        IYieldManager(yieldManager).dripsForceWithdraw(senderAccountId, accountId, erc20, strategy, amt, transferTo);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                        GIVE
    // ═══════════════════════════════════════════════════════════════════════════

    function give(uint256 accountId, uint256 receiver, IERC20 erc20, uint128 amt)
        public
        whenNotPaused
        onlyDriver(accountId)
    {
        if (amt != 0) {
            _verifyBalanceIncrease(erc20, amt);
            _dripsStorage().balances[erc20].splits += amt;
        }
        Splits._give(accountId, receiver, erc20, amt);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                        SET SPLITS
    // ═══════════════════════════════════════════════════════════════════════════

    function setSplits(uint256 accountId, SplitsReceiver[] memory receivers)
        public
        whenNotPaused
        onlyDriver(accountId)
    {
        Splits._setSplits(accountId, receivers);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                        METADATA
    // ═══════════════════════════════════════════════════════════════════════════

    function emitAccountMetadata(uint256 accountId, AccountMetadata[] calldata accountMetadata)
        public
        whenNotPaused
        onlyDriver(accountId)
    {
        unchecked {
            for (uint256 i = 0; i < accountMetadata.length; i++) {
                AccountMetadata calldata metadata = accountMetadata[i];
                emit AccountMetadataEmitted(accountId, metadata.key, metadata.value);
            }
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
