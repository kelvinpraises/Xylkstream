// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {StreamReceiver} from "./Streams.sol";
import {SplitsReceiver} from "./Splits.sol";

/// @notice The account metadata.
struct AccountMetadata {
    bytes32 key;
    bytes value;
}

/// @notice Interface for the Drips protocol (used by drivers to talk to the router).
interface IDrips {
    function registerDriver(address driverAddr) external returns (uint32 driverId);
    function driverAddress(uint32 driverId) external view returns (address driverAddr);
    function updateDriverAddress(uint32 driverId, address newDriverAddr) external;
    function nextDriverId() external view returns (uint32 driverId);

    function balances(IERC20 erc20) external view returns (uint128 streamsBalance, uint128 splitsBalance);
    function withdraw(IERC20 erc20, address receiver, uint256 amt) external;

    function receiveStreams(uint256 accountId, IERC20 erc20, uint32 maxCycles)
        external returns (uint128 receivedAmt);
    function streamsState(uint256 accountId, IERC20 erc20)
        external view returns (bytes32, bytes32, uint32, uint128, uint32);
    function setStreams(
        uint256 accountId,
        IERC20 erc20,
        StreamReceiver[] memory currReceivers,
        int128 balanceDelta,
        StreamReceiver[] memory newReceivers,
        uint32 maxEndHint1,
        uint32 maxEndHint2
    ) external returns (int128 realBalanceDelta);

    function splittable(uint256 accountId, IERC20 erc20) external view returns (uint128 amt);
    function split(uint256 accountId, IERC20 erc20, SplitsReceiver[] memory currReceivers)
        external returns (uint128 collectableAmt, uint128 splitAmt);
    function collectable(uint256 accountId, IERC20 erc20) external view returns (uint128 amt);
    function collect(uint256 accountId, IERC20 erc20) external returns (uint128 amt);
    function forceCollect(
        uint256 accountId, IERC20 erc20, address yieldManager, address strategy, address transferTo
    ) external returns (uint128 amt);

    function give(uint256 accountId, uint256 receiver, IERC20 erc20, uint128 amt) external;
    function setSplits(uint256 accountId, SplitsReceiver[] memory receivers) external;
    function emitAccountMetadata(uint256 accountId, AccountMetadata[] calldata accountMetadata) external;

    function cycleSecs() external view returns (uint32);
    function minAmtPerSec() external view returns (uint160);
    function AMT_PER_SEC_MULTIPLIER() external view returns (uint160);
}
