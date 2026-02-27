// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IDrips} from "src/IDrips.sol";
import {DripsFacetA} from "src/DripsFacetA.sol";
import {DripsFacetB} from "src/DripsFacetB.sol";
import {DripsRouter} from "src/DripsRouter.sol";
import {Caller} from "src/Caller.sol";
import {AddressDriver} from "src/AddressDriver.sol";
import {ManagedProxy, Managed} from "src/Managed.sol";
import {YieldManager} from "src/YieldManager.sol";
import {TempoDEXStrategy} from "src/extensions/TempoDEXStrategy.sol";

/// @title Deploy Script — Deploys all Xylkstream contracts to Tempo testnet
contract DeployScript is Script {
    address constant WALLET_1 = 0x031891A61200FedDd622EbACC10734BC90093B2A;
    uint256 constant WALLET_1_PK = 0x2b9e3b8a095940cf3461e27bfb2bebb498df9a6381b76b9f9c48c9bbdc3c8192;

    function run() external {
        console.log("=== DEPLOYING XYLKSTREAM TO TEMPO TESTNET ===");

        vm.startBroadcast(WALLET_1_PK);

        // 1. Deploy facets
        DripsFacetA facetA = new DripsFacetA(10);
        DripsFacetB facetB = new DripsFacetB();

        // 2. Deploy router
        DripsRouter router = new DripsRouter(address(facetA), address(facetB));

        // 3. Deploy ManagedProxy pointing at FacetA (for admin/upgrade storage init)
        Managed dripsProxy = Managed(address(new ManagedProxy(Managed(address(router)), WALLET_1, "")));
        IDrips drips = IDrips(address(dripsProxy));
        console.log("Drips (Router):", address(drips));

        // 4. Caller
        Caller caller = new Caller();
        console.log("Caller:", address(caller));

        // 5. Register driver IDs (make AddressDriver driverId = 2)
        drips.registerDriver(address(1));
        drips.registerDriver(address(1));
        uint32 driverId = drips.registerDriver(WALLET_1);
        console.log("DriverId:", driverId);

        // 6. AddressDriver
        AddressDriver driverLogic = new AddressDriver(drips, address(caller), driverId);
        AddressDriver driver = AddressDriver(address(new ManagedProxy(driverLogic, WALLET_1, "")));
        drips.updateDriverAddress(driverId, address(driver));
        console.log("AddressDriver:", address(driver));

        // 7. YieldManager
        YieldManager yieldManager = new YieldManager(address(drips));
        console.log("YieldManager:", address(yieldManager));

        // 8. TempoDEXStrategy
        TempoDEXStrategy strategy = new TempoDEXStrategy(address(yieldManager));
        console.log("TempoDEXStrategy:", address(strategy));

        vm.stopBroadcast();

        console.log("");
        console.log("=== DEPLOYMENT COMPLETE ===");
    }
}
