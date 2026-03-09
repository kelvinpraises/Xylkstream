// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

import {DripsRouter} from "src/protocol/DripsRouter.sol";
import {DripsFacetA} from "src/protocol/DripsFacetA.sol";
import {DripsFacetB} from "src/protocol/DripsFacetB.sol";
import {IDrips} from "src/protocol/IDrips.sol";
import {Managed, ManagedProxy} from "src/protocol/Managed.sol";
import {StreamReceiver} from "src/protocol/Streams.sol";
import {SplitsReceiver} from "src/protocol/Splits.sol";

import {ZWERC20} from "src/privacy/ZWERC20.sol";
import {IERC8065} from "src/privacy/IERC8065.sol";
import {BaseZWToken} from "src/privacy/BaseZWToken.sol";
import {Groth16Verifier} from "src/privacy/Groth16Verifier.sol";

import {MockERC20} from "test/mocks/MockERC20.sol";

// =============================================================================
// PrivacyRouterTest
// Tests privacy wrapping functions (setStreamsPrivate, collectPrivate,
// givePrivate, deposit, withdraw) that live directly on DripsRouter.
//
// Setup mirrors Xylkstream.t.sol: real DripsFacetA + DripsFacetB + DripsRouter
// behind ManagedProxy. The privacy driver ID is registered on this same proxy
// so DripsRouter acts as both the Drips protocol AND the privacy driver.
// =============================================================================

contract PrivacyRouterTest is Test {
    // Redeclare events so vm.expectEmit works (Solidity doesn't allow
    // `emit ContractName.EventName(...)` syntax in test assertions).
    event ZwTokenRegistered(IERC20 indexed underlying, IERC8065 indexed zwToken);

    // -------------------------------------------------------------------------
    // Actors
    // -------------------------------------------------------------------------
    address internal admin  = address(0xAD);
    address internal alice  = address(0xA11CE);
    address internal bob    = address(0xB0B);

    // -------------------------------------------------------------------------
    // Protocol
    // -------------------------------------------------------------------------

    /// @dev The ManagedProxy wrapping DripsRouter — this is the Drips entry point.
    IDrips     internal drips;

    /// @dev DripsRouter cast directly (to call privacy-specific named functions).
    DripsRouter internal router;

    MockERC20       internal underlying;
    ZWERC20         internal zwToken;
    Groth16Verifier internal verifier;

    /// @dev Driver ID assigned to the privacy driver (DripsRouter itself).
    uint32 internal driverId;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------
    uint256 internal constant INITIAL_MINT = 1_000_000e18;
    uint128 internal constant STREAM_AMT   = 1_000e18;

    // -------------------------------------------------------------------------
    // setUp
    // -------------------------------------------------------------------------

    function setUp() public {
        // 1. Deploy DripsFacetA + DripsFacetB (logic contracts).
        DripsFacetA facetA = new DripsFacetA(10); // 10-second cycle
        DripsFacetB facetB = new DripsFacetB();

        // 2. We need the driver ID before deploying DripsRouter (chicken-and-egg).
        //    Deploy a temporary DripsRouter with a dummy driverId=0 just to get a
        //    proxy up so we can call registerDriver. Then deploy the real router.
        //
        //    Alternative (simpler): use a two-step approach —
        //      a) Deploy DripsRouter with driverId=0 and admin address.
        //      b) Wrap in ManagedProxy.
        //      c) Register the driver on the proxy → get real driverId.
        //      d) Deploy the final DripsRouter with the real driverId.
        //      e) Upgrade the proxy impl to the final router.
        //
        //    However ManagedProxy does not expose an upgradeToAndCall that we can
        //    call from here without going through the admin flow. The cleanest path
        //    is the same pattern AddressDriver uses in Xylkstream.t.sol:
        //      - Register the driver under admin as a placeholder.
        //      - Deploy the final router with that ID.
        //      - Update the driver address.

        // 2a. Deploy a temporary router (driverId placeholder = 0) just to have
        //     a Drips proxy we can call registerDriver on.
        DripsRouter tmpRouter = new DripsRouter(address(facetA), address(facetB), 0, admin);
        drips = IDrips(address(new ManagedProxy(Managed(address(tmpRouter)), admin, "")));

        // 2b. Register the privacy driver under admin as placeholder.
        vm.prank(admin);
        driverId = drips.registerDriver(admin);

        // 2c. Deploy the real DripsRouter with the correct driverId.
        DripsRouter realRouter = new DripsRouter(address(facetA), address(facetB), driverId, admin);

        // 2d. Upgrade the proxy to point to the real router.
        //     bypass the onlyProxy UUPS requirement which fails here because DripsRouter delegates to FacetA.
        bytes32 implSlot = bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);
        vm.store(address(drips), implSlot, bytes32(uint256(uint160(address(realRouter)))));

        // 2e. Update the driver address to the proxy (not the logic contract).
        vm.prank(admin);
        drips.updateDriverAddress(driverId, address(drips));

        // 2f. Keep a typed reference to the router functions via the proxy address.
        router = DripsRouter(payable(address(drips)));

        // 3. Deploy underlying ERC-20.
        underlying = new MockERC20("Mock USDC", "mUSDC", 18);

        // 4. Deploy Groth16Verifier (required by ZWERC20).
        verifier = new Groth16Verifier();

        // 5. Deploy ZWERC20 with zero fees for test simplicity.
        BaseZWToken.ZwConfig memory cfg = BaseZWToken.ZwConfig({
            verifier:       address(verifier),
            feeCollector:   address(0xFEE),
            feeDenominator: 10_000,
            depositFee:     0,
            remintFee:      0,
            withdrawFee:    0,
            minDepositFee:  0,
            minWithdrawFee: 0,
            minRemintFee:   0
        });
        zwToken = new ZWERC20("ZW Mock USDC", "ZW-mUSDC", 18, address(underlying), cfg);

        // 6. Admin registers the token pair on the router.
        vm.prank(admin);
        router.registerZwToken(IERC20(address(underlying)), IERC8065(address(zwToken)));

        // 7. Mint underlying to test actors.
        underlying.mint(alice, INITIAL_MINT);
        underlying.mint(bob,   INITIAL_MINT);
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    /// @dev Return alice's Drips account ID under the privacy driver.
    function _aliceAcct() internal view returns (uint256) {
        return router.calcAccountId(alice);
    }

    /// @dev Return bob's Drips account ID under the privacy driver.
    function _bobAcct() internal view returns (uint256) {
        return router.calcAccountId(bob);
    }

    /// @dev Empty stream receiver array.
    function _noReceivers() internal pure returns (StreamReceiver[] memory) {
        return new StreamReceiver[](0);
    }

    /// @dev Empty splits receiver array.
    function _noSplits() internal pure returns (SplitsReceiver[] memory) {
        return new SplitsReceiver[](0);
    }

    function _zeroCfg() internal view returns (BaseZWToken.ZwConfig memory cfg) {
        cfg = BaseZWToken.ZwConfig({
            verifier:       address(verifier),
            feeCollector:   address(0xFEE),
            feeDenominator: 10_000,
            depositFee:     0,
            remintFee:      0,
            withdrawFee:    0,
            minDepositFee:  0,
            minWithdrawFee: 0,
            minRemintFee:   0
        });
    }

    function _emptyRemintData() internal pure returns (IERC8065.RemintData memory data) {
        data = IERC8065.RemintData({
            commitment:  bytes32(0),
            nullifiers:  new bytes32[](0),
            proverData:  "",
            relayerData: "",
            redeem:      false,
            proof:       ""
        });
    }

    // =========================================================================
    // Happy-path tests
    // =========================================================================

    // 1. Admin registers a token pair
    function test_registerZwToken() public {
        MockERC20 newToken = new MockERC20("TK2", "TK2", 6);
        ZWERC20   newZw    = new ZWERC20("ZW-TK2", "ZW-TK2", 6, address(newToken), _zeroCfg());

        vm.prank(admin);
        vm.expectEmit(true, true, false, false);
        emit ZwTokenRegistered(IERC20(address(newToken)), IERC8065(address(newZw)));
        router.registerZwToken(IERC20(address(newToken)), IERC8065(address(newZw)));

        assertEq(
            address(router.zwTokens(IERC20(address(newToken)))),
            address(newZw)
        );
    }

    // 2. setStreamsPrivate — positive balanceDelta (deposit)
    function test_setStreamsPrivate_deposit() public {
        uint256 aliceUnderlyingBefore = underlying.balanceOf(alice);

        vm.startPrank(alice);
        underlying.approve(address(router), STREAM_AMT);
        router.setStreamsPrivate(
            IERC20(address(underlying)),
            _noReceivers(),
            int128(STREAM_AMT),
            _noReceivers(),
            0,
            0,
            alice // transferTo (not used for positive delta, but must be non-zero)
        );
        vm.stopPrank();

        // Alice's underlying decreased.
        assertEq(underlying.balanceOf(alice), aliceUnderlyingBefore - STREAM_AMT);

        // The Drips protocol should now hold STREAM_AMT in ZWT for alice's streams balance.
        (,,, uint128 streamsBalance,) = drips.streamsState(_aliceAcct(), IERC20(address(zwToken)));
        assertEq(streamsBalance, STREAM_AMT, "Drips streams balance should equal deposited amount");

        // No ZWT should linger in the router (proxy) outside of protocol accounting.
        // The ZWT IS in address(drips) / address(router) — but it is tracked internally
        // by the Drips protocol. We verify protocol state via streamsState, not raw balances.
    }

    // 3. setStreamsPrivate — negative balanceDelta (withdraw surplus)
    function test_setStreamsPrivate_withdraw() public {
        // First deposit so there's something to withdraw.
        vm.startPrank(alice);
        underlying.approve(address(router), STREAM_AMT);
        router.setStreamsPrivate(
            IERC20(address(underlying)),
            _noReceivers(),
            int128(STREAM_AMT),
            _noReceivers(),
            0,
            0,
            alice
        );
        vm.stopPrank();

        // Ensure ZWERC20 holds enough underlying to cover the unwrap on withdrawal.
        underlying.mint(address(zwToken), STREAM_AMT);

        uint256 aliceUnderlyingBefore = underlying.balanceOf(alice);

        vm.prank(alice);
        router.setStreamsPrivate(
            IERC20(address(underlying)),
            _noReceivers(),
            -int128(STREAM_AMT),
            _noReceivers(),
            0,
            0,
            alice
        );

        // Alice should have received exactly STREAM_AMT underlying back (0 fees).
        assertEq(underlying.balanceOf(alice), aliceUnderlyingBefore + STREAM_AMT);

        // Drips streams balance for alice should now be 0.
        (,,, uint128 streamsBalance,) = drips.streamsState(_aliceAcct(), IERC20(address(zwToken)));
        assertEq(streamsBalance, 0, "Streams balance should be 0 after full withdrawal");
    }

    // 4. collectPrivate — no remint, keep ZWT (redeemRaw = false)
    function test_collectPrivate_noRemint_keepZwt() public {
        // Seed: alice gives ZWT to bob's account so bob has something collectable.
        // To do this cleanly, we use the privacy give path.
        underlying.mint(alice, STREAM_AMT);
        vm.startPrank(alice);
        underlying.approve(address(router), STREAM_AMT);
        router.givePrivate(_bobAcct(), IERC20(address(underlying)), STREAM_AMT);
        vm.stopPrank();

        // Bob must split before collecting (no split receivers → all goes to collectable).
        drips.split(_bobAcct(), IERC20(address(zwToken)), _noSplits());

        uint256 zwBalBefore = IERC20(address(zwToken)).balanceOf(bob);

        vm.prank(bob);
        uint128 collected = router.collectPrivate(
            IERC20(address(underlying)),
            bob,        // transferTo
            false,      // doRemint
            _emptyRemintData(),
            false       // redeemRaw — keep ZWT
        );

        assertEq(collected, STREAM_AMT, "Collected amount should match given amount");
        // Bob receives raw ZWT.
        assertEq(IERC20(address(zwToken)).balanceOf(bob), zwBalBefore + STREAM_AMT);
    }

    // 5. collectPrivate — no remint, redeemRaw = true (unwrap to underlying)
    function test_collectPrivate_noRemint_redeemRaw() public {
        // Seed: alice gives STREAM_AMT to bob via privacy give.
        underlying.mint(alice, STREAM_AMT);
        vm.startPrank(alice);
        underlying.approve(address(router), STREAM_AMT);
        router.givePrivate(_bobAcct(), IERC20(address(underlying)), STREAM_AMT);
        vm.stopPrank();

        // Split so bob's amount moves from splittable → collectable.
        drips.split(_bobAcct(), IERC20(address(zwToken)), _noSplits());

        // Ensure ZWERC20 holds underlying to cover the unwrap.
        underlying.mint(address(zwToken), STREAM_AMT);

        uint256 aliceUnderlyingBefore = underlying.balanceOf(alice);
        uint256 bobUnderlyingBefore   = underlying.balanceOf(bob);

        vm.prank(bob);
        uint128 collected = router.collectPrivate(
            IERC20(address(underlying)),
            bob,
            false,      // doRemint
            _emptyRemintData(),
            true        // redeemRaw — unwrap to underlying
        );

        assertEq(collected, STREAM_AMT);
        // Bob receives underlying.
        assertEq(underlying.balanceOf(bob), bobUnderlyingBefore + STREAM_AMT);
        // Alice's balance is unchanged.
        assertEq(underlying.balanceOf(alice), aliceUnderlyingBefore);
        // No ZWT left in the router.
        assertEq(IERC20(address(zwToken)).balanceOf(address(router)), 0);
    }

    // 6. collectPrivate — with remint (ZK proof path) — intentionally skipped.
    //
    // The remint path in ZWERC20 requires a valid Groth16 zero-knowledge proof,
    // a pre-existing Merkle commitment, and a valid nullifier.  Generating these
    // on-chain inside a Forge test without a real prover is not feasible.  This
    // path is tested end-to-end in the client integration suite.
    function test_collectPrivate_withRemint_skipped() public pure {
        // No-op. See comment above.
    }

    // 7. givePrivate — wrap and give to another account
    function test_givePrivate() public {
        uint256 aliceUnderlyingBefore = underlying.balanceOf(alice);

        vm.startPrank(alice);
        underlying.approve(address(router), STREAM_AMT);
        router.givePrivate(_bobAcct(), IERC20(address(underlying)), STREAM_AMT);
        vm.stopPrank();

        // Alice's underlying decreased.
        assertEq(underlying.balanceOf(alice), aliceUnderlyingBefore - STREAM_AMT);

        // No ZWT or underlying should remain in the router beyond what the protocol tracks.
        assertEq(underlying.balanceOf(address(router)), 0);

        // Bob's account should have STREAM_AMT splittable in ZWT.
        uint128 splittable = drips.splittable(_bobAcct(), IERC20(address(zwToken)));
        assertEq(splittable, STREAM_AMT, "Bob should have ZWT splittable after givePrivate");
    }

    // 8. deposit — direct convenience function
    function test_deposit() public {
        uint256 aliceUnderlyingBefore = underlying.balanceOf(alice);
        uint256 aliceZwBefore         = IERC20(address(zwToken)).balanceOf(alice);

        vm.startPrank(alice);
        underlying.approve(address(router), STREAM_AMT);
        router.deposit(IERC20(address(underlying)), STREAM_AMT);
        vm.stopPrank();

        // Alice spent underlying.
        assertEq(underlying.balanceOf(alice), aliceUnderlyingBefore - STREAM_AMT);
        // Alice received ZWT directly.
        assertEq(IERC20(address(zwToken)).balanceOf(alice), aliceZwBefore + STREAM_AMT);
        // No residual underlying approval on ZWERC20.
        assertEq(underlying.allowance(address(router), address(zwToken)), 0);
    }

    // 9. withdraw — direct convenience function
    function test_withdraw() public {
        // Give alice some ZWT by depositing first.
        vm.startPrank(alice);
        underlying.approve(address(router), STREAM_AMT);
        router.deposit(IERC20(address(underlying)), STREAM_AMT);
        vm.stopPrank();

        // Ensure ZWERC20 holds enough underlying to cover the withdrawal.
        underlying.mint(address(zwToken), STREAM_AMT);

        uint256 aliceUnderlyingBefore = underlying.balanceOf(alice);
        uint256 aliceZwBefore         = IERC20(address(zwToken)).balanceOf(alice);

        vm.startPrank(alice);
        IERC20(address(zwToken)).approve(address(router), STREAM_AMT);
        router.withdraw(IERC20(address(underlying)), STREAM_AMT);
        vm.stopPrank();

        // Alice burned ZWT.
        assertEq(IERC20(address(zwToken)).balanceOf(alice), aliceZwBefore - STREAM_AMT);
        // Alice received underlying.
        assertEq(underlying.balanceOf(alice), aliceUnderlyingBefore + STREAM_AMT);
    }

    // 10. calcAccountId — verify packing: (driverId << 224) | uint160(addr)
    function test_calcAccountId() public view {
        address addr     = address(0xDEAD);
        uint256 expected = (uint256(driverId) << 224) | uint160(addr);
        assertEq(router.calcAccountId(addr), expected);
    }

    // =========================================================================
    // Sad-path tests
    // =========================================================================

    // 11. Non-admin cannot registerZwToken
    function test_revert_registerZwToken_notAdmin() public {
        MockERC20 newToken = new MockERC20("TK3", "TK3", 6);
        ZWERC20   newZw    = new ZWERC20("ZW-TK3", "ZW-TK3", 6, address(newToken), _zeroCfg());

        vm.prank(alice);
        vm.expectRevert(DripsRouter.NotAdmin.selector);
        router.registerZwToken(IERC20(address(newToken)), IERC8065(address(newZw)));
    }

    // 12. setStreamsPrivate reverts for unregistered token
    function test_revert_setStreamsPrivate_unregisteredToken() public {
        MockERC20 unknown = new MockERC20("UNK", "UNK", 18);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(DripsRouter.ZwTokenNotRegistered.selector, IERC20(address(unknown)))
        );
        router.setStreamsPrivate(
            IERC20(address(unknown)),
            _noReceivers(),
            int128(STREAM_AMT),
            _noReceivers(),
            0,
            0,
            alice
        );
    }

    // 13. setStreamsPrivate reverts when transferTo = address(0)
    function test_revert_setStreamsPrivate_zeroAddress() public {
        vm.prank(alice);
        vm.expectRevert(DripsRouter.ZeroAddress.selector);
        router.setStreamsPrivate(
            IERC20(address(underlying)),
            _noReceivers(),
            int128(STREAM_AMT),
            _noReceivers(),
            0,
            0,
            address(0) // <-- zero transferTo
        );
    }

    // 14. collectPrivate reverts when transferTo = address(0)
    function test_revert_collectPrivate_zeroAddress() public {
        vm.prank(alice);
        vm.expectRevert(DripsRouter.ZeroAddress.selector);
        router.collectPrivate(
            IERC20(address(underlying)),
            address(0), // <-- zero transferTo
            false,
            _emptyRemintData(),
            false
        );
    }

    // 15. givePrivate reverts when amount = 0
    function test_revert_givePrivate_zeroAmount() public {
        uint256 bobId = _bobAcct();
        vm.prank(alice);
        vm.expectRevert(DripsRouter.ZeroAmount.selector);
        router.givePrivate(bobId, IERC20(address(underlying)), 0);
    }

    // 16. deposit reverts when amount = 0
    function test_revert_deposit_zeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(DripsRouter.ZeroAmount.selector);
        router.deposit(IERC20(address(underlying)), 0);
    }

    // 17. withdraw reverts when amount = 0
    function test_revert_withdraw_zeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(DripsRouter.ZeroAmount.selector);
        router.withdraw(IERC20(address(underlying)), 0);
    }
}
