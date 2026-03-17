// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import {VerifyingPaymaster} from "@account-abstraction/contracts/samples/VerifyingPaymaster.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

/**
 * VerifyingPaymaster with explicit owner — required because we deploy via CREATE2
 * where msg.sender is the factory, not the deployer. We pass the intended owner
 * explicitly and transfer ownership in the constructor.
 */
contract XylkPaymaster is VerifyingPaymaster {
    constructor(IEntryPoint _entryPoint, address _verifyingSigner, address _owner)
        VerifyingPaymaster(_entryPoint, _verifyingSigner)
    {
        _transferOwnership(_owner);
    }
}
