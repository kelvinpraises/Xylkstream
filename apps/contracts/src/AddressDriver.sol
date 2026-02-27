// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {IDrips, AccountMetadata} from "./IDrips.sol";
import {StreamReceiver} from "./Streams.sol";
import {SplitsReceiver} from "./Splits.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {Managed} from "./Managed.sol";
import {DriverTransferUtils} from "./DriverTransferUtils.sol";

/// @notice A Drips driver implementing address-based account identification.
contract AddressDriver is DriverTransferUtils, Managed {
    IDrips public immutable drips;
    uint32 public immutable driverId;

    constructor(
        IDrips drips_,
        address forwarder,
        uint32 driverId_
    ) DriverTransferUtils(forwarder) {
        drips = drips_;
        driverId = driverId_;
    }

    function _drips() internal view override returns (IDrips) {
        return drips;
    }

    function calcAccountId(address addr) public view returns (uint256 accountId) {
        accountId = driverId;
        accountId = (accountId << 224) | uint160(addr);
    }

    function _callerAccountId() internal view returns (uint256 accountId) {
        return calcAccountId(_msgSender());
    }

    function collect(
        IERC20 erc20,
        address transferTo
    ) public whenNotPaused returns (uint128 amt) {
        return _collectAndTransfer(_callerAccountId(), erc20, transferTo);
    }

    function forceCollect(
        IERC20 erc20,
        address yieldManager,
        address strategy,
        address transferTo,
        bytes calldata strategyData
    ) public whenNotPaused returns (uint128 amt) {
        uint256 accountId = _callerAccountId();
        amt = drips.forceCollect(accountId, erc20, yieldManager, strategy, transferTo);
        (bool success, ) = strategy.call(
            abi.encodeWithSignature(
                "forceWithdraw(address,uint256,uint128,bytes)",
                yieldManager,
                accountId,
                amt,
                strategyData
            )
        );
        require(success, "Strategy withdrawal failed");
    }

    function give(uint256 receiver, IERC20 erc20, uint128 amt) public whenNotPaused {
        _giveAndTransfer(_callerAccountId(), receiver, erc20, amt);
    }

    function setStreams(
        IERC20 erc20,
        StreamReceiver[] calldata currReceivers,
        int128 balanceDelta,
        StreamReceiver[] calldata newReceivers,
        uint32 maxEndHint1,
        uint32 maxEndHint2,
        address transferTo
    ) public whenNotPaused returns (int128 realBalanceDelta) {
        return _setStreamsAndTransfer(
            _callerAccountId(), erc20, currReceivers, balanceDelta,
            newReceivers, maxEndHint1, maxEndHint2, transferTo
        );
    }

    function setSplits(SplitsReceiver[] calldata receivers) public whenNotPaused {
        drips.setSplits(_callerAccountId(), receivers);
    }

    function emitAccountMetadata(
        AccountMetadata[] calldata accountMetadata
    ) public whenNotPaused {
        drips.emitAccountMetadata(_callerAccountId(), accountMetadata);
    }
}
