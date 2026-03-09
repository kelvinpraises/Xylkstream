// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// These imports exist solely to make Forge compile AA contracts into out/
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {Safe} from "@safe-global/safe-contracts/contracts/Safe.sol";
import {SafeProxyFactory} from "@safe-global/safe-contracts/contracts/proxies/SafeProxyFactory.sol";
import {SafeProxy} from "@safe-global/safe-contracts/contracts/proxies/SafeProxy.sol";
import {Safe4337Module} from "@safe-global/safe-modules/4337/contracts/Safe4337Module.sol";
import {SafeModuleSetup} from "@safe-global/safe-modules/4337/contracts/SafeModuleSetup.sol";
import {MultiSend} from "@safe-global/safe-contracts/contracts/libraries/MultiSend.sol";
import {MultiSendCallOnly} from "@safe-global/safe-contracts/contracts/libraries/MultiSendCallOnly.sol";
import {CompatibilityFallbackHandler} from "@safe-global/safe-contracts/contracts/handler/CompatibilityFallbackHandler.sol";
import {SignMessageLib} from "@safe-global/safe-contracts/contracts/libraries/SignMessageLib.sol";
import {CreateCall} from "@safe-global/safe-contracts/contracts/libraries/CreateCall.sol";
import {SimulateTxAccessor} from "@safe-global/safe-contracts/contracts/accessors/SimulateTxAccessor.sol";
import {VerifyingPaymaster} from "@account-abstraction/contracts/samples/VerifyingPaymaster.sol";
