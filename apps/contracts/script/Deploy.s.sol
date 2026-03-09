// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {IDrips} from "src/protocol/IDrips.sol";
import {DripsFacetA} from "src/protocol/DripsFacetA.sol";
import {DripsFacetB} from "src/protocol/DripsFacetB.sol";
import {DripsRouter} from "src/protocol/DripsRouter.sol";
import {Caller} from "src/protocol/Caller.sol";
import {AddressDriver} from "src/drivers/AddressDriver.sol";
import {ManagedProxy, Managed} from "src/protocol/Managed.sol";
import {YieldManager} from "src/yield/YieldManager.sol";
import {Groth16Verifier} from "src/privacy/Groth16Verifier.sol";
import {ZWERC20} from "src/privacy/ZWERC20.sol";
import {BaseZWToken} from "src/privacy/BaseZWToken.sol";
import {IERC8065} from "src/privacy/IERC8065.sol";

/// @title Deploy Script — Deploys all Xylkstream contracts (core + privacy)
/// @dev Usage: forge script script/Deploy.s.sol --rpc-url $RPC --broadcast
///      Set DEPLOYER_PRIVATE_KEY env var. Optionally set UNDERLYING_TOKEN for mainnet.
contract DeployScript is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);

        console.log("=== DEPLOYING XYLKSTREAM ===");
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPk);

        address dripsProxy = _deployCore(deployer);
        _deployPrivacy(deployer, dripsProxy);

        vm.stopBroadcast();
        console.log("=== DEPLOYMENT COMPLETE ===");
    }

    function _deployCore(address deployer) internal returns (address) {
        DripsFacetA facetA = new DripsFacetA(10);
        DripsFacetB facetB = new DripsFacetB();
        DripsRouter router = new DripsRouter(address(facetA), address(facetB), 0, deployer);

        address dripsProxy = address(new ManagedProxy(Managed(address(router)), deployer, ""));
        IDrips drips = IDrips(dripsProxy);
        console.log("Drips Proxy:", dripsProxy);

        console.log("Caller:", address(new Caller()));

        // Register AddressDriver at driverId=2
        drips.registerDriver(address(1));
        drips.registerDriver(address(1));
        uint32 driverId = drips.registerDriver(deployer);

        AddressDriver driverLogic = new AddressDriver(drips, address(new Caller()), driverId);
        AddressDriver driver = AddressDriver(address(new ManagedProxy(driverLogic, deployer, "")));
        drips.updateDriverAddress(driverId, address(driver));
        console.log("AddressDriver:", address(driver));

        console.log("YieldManager:", address(new YieldManager(dripsProxy)));

        return dripsProxy;
    }

    function _deployPrivacy(address deployer, address dripsProxy) internal {
        Groth16Verifier verifier = new Groth16Verifier();
        console.log("Groth16Verifier:", address(verifier));

        // Deploy MockERC20 if no UNDERLYING_TOKEN env var
        address underlying = vm.envOr("UNDERLYING_TOKEN", address(0));
        if (underlying == address(0)) {
            bytes memory mockBytecode = abi.encodePacked(
                vm.getCode("MockERC20.sol:MockERC20"),
                abi.encode("Test USDT", "tUSDT", uint8(18))
            );
            assembly {
                underlying := create(0, add(mockBytecode, 0x20), mload(mockBytecode))
            }
            require(underlying != address(0), "MockERC20 deploy failed");
            console.log("MockERC20:", underlying);
        }

        BaseZWToken.ZwConfig memory cfg = BaseZWToken.ZwConfig({
            verifier:       address(verifier),
            feeCollector:   deployer,
            feeDenominator: 10_000,
            depositFee:     0,
            remintFee:      0,
            withdrawFee:    0,
            minDepositFee:  0,
            minWithdrawFee: 0,
            minRemintFee:   0
        });

        ZWERC20 zwToken = new ZWERC20("ZW Test USDT", "zwUSDT", 18, underlying, cfg);
        console.log("ZWERC20:", address(zwToken));

        DripsRouter(payable(dripsProxy)).registerZwToken(
            IERC20(underlying),
            IERC8065(address(zwToken))
        );
        console.log("ZwToken registered");
    }
}
