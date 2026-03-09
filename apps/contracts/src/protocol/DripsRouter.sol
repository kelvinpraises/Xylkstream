// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {IDrips} from "./IDrips.sol";
import {StreamReceiver} from "./Streams.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC8065} from "../privacy/IERC8065.sol";

/// @notice DripsRouter — single entry point that delegates to FacetA or FacetB.
/// Uses delegatecall so both facets share this contract's storage.
/// This contract is deployed behind ManagedProxy just like the old DripsCore.
/// All selector routing is done in _route() which is called by fallback().
///
/// Privacy layer: named functions (setStreamsPrivate, collectPrivate, givePrivate,
/// deposit, withdraw) execute directly on DripsRouter (NOT via delegatecall).
/// They wrap plain ERC-20 tokens into ZWERC20 (ERC-8065) privacy tokens before
/// they enter the streaming protocol, hiding the on-chain link between payer and
/// receiver. Since DripsRouter IS the Drips proxy, all internal Drips calls are
/// done via delegatecall to the appropriate facet.
///
/// Storage note: zwTokens, privacyAdmin, and DRIVER_ID are appended AFTER all
/// existing Managed/Drips storage. They occupy fresh slots and cannot collide
/// with FacetA/FacetB storage because delegatecall shares THIS contract's storage
/// layout and no existing slot uses these variable names.
contract DripsRouter {
    using SafeERC20 for IERC20;

    // =========================================================================
    // Immutables (facets)
    // =========================================================================

    address public immutable FACET_A;
    address public immutable FACET_B;

    // =========================================================================
    // Privacy immutable
    // =========================================================================

    /// @notice The Drips driver ID assigned to this router as a privacy driver.
    /// Set once in the constructor; used to pack account IDs for privacy callers.
    uint32 public immutable DRIVER_ID;

    // =========================================================================
    // Privacy errors
    // =========================================================================

    error NotAdmin();
    error ZwTokenNotRegistered(IERC20 erc20);
    error ZeroAmount();
    error ZeroAddress();
    error BalanceOverflow();
    error DelegatecallFailed();

    // =========================================================================
    // Privacy events
    // =========================================================================

    /// @notice Emitted when a new underlying → ZW wrapper mapping is registered.
    event ZwTokenRegistered(IERC20 indexed underlying, IERC8065 indexed zwToken);

    /// @notice Emitted after a successful setStreamsPrivate call.
    /// @param accountId       The caller's Drips account ID.
    /// @param zwToken         The ZW token used for streaming.
    /// @param realBalanceDelta Actual balance change returned by DRIPS (may differ from requested).
    event PrivateStreamSet(uint256 indexed accountId, IERC8065 indexed zwToken, int128 realBalanceDelta);

    /// @notice Emitted after a successful collectPrivate call.
    /// @param accountId The caller's Drips account ID.
    /// @param zwToken   The ZW token that was collected.
    /// @param amt       Amount of ZWT collected.
    event PrivateCollected(uint256 indexed accountId, IERC8065 indexed zwToken, uint128 amt);

    /// @notice Emitted after a successful givePrivate call.
    /// @param accountId The giver's Drips account ID.
    /// @param receiver  The recipient Drips account ID.
    /// @param zwToken   The ZW token given.
    /// @param amt       Amount given.
    event PrivateGiven(uint256 indexed accountId, uint256 indexed receiver, IERC8065 indexed zwToken, uint128 amt);

    // =========================================================================
    // Privacy storage
    // =========================================================================

    /// @notice Admin address that can register ZW token mappings.
    address public immutable privacyAdmin;

    /// @notice Maps an underlying ERC-20 token to its ZWERC20 (ERC-8065) wrapper.
    mapping(IERC20 => IERC8065) public zwTokens;

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier onlyPrivacyAdmin() {
        if (msg.sender != privacyAdmin) revert NotAdmin();
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(address facetA_, address facetB_, uint32 driverId_, address privacyAdmin_) {
        FACET_A = facetA_;
        FACET_B = facetB_;
        DRIVER_ID = driverId_;
        privacyAdmin = privacyAdmin_;
    }

    // =========================================================================
    // Fallback routing (delegatecall to facets)
    // =========================================================================

    /// @dev Routes all calls to the appropriate facet via delegatecall.
    /// FacetA: streams, drivers, balances, withdraw, receiveStreams, setStreams, streamsState
    /// FacetB: splits, give, collect, forceCollect, setSplits, metadata, splittable, collectable
    /// Admin/Managed functions go to FacetA (it has the full Managed inheritance).
    fallback() external payable {
        address target = _route(msg.sig);
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    receive() external payable {}

    function _route(bytes4 sig) internal view returns (address) {
        // FacetB selectors: splits/collect/give/metadata
        if (
            sig == 0xf98e7e1d || // splittable(uint256,address)
            sig == 0x0ea2063a || // split(uint256,address,(uint256,uint32)[])
            sig == 0x1ec026c8 || // collectable(uint256,address)
            sig == 0x8d3c100a || // collect(uint256,address)
            sig == 0xd77bcf03 || // forceCollect(uint256,address,address,address,uint256,address)
            sig == 0xd9e01070 || // give(uint256,uint256,address,uint128)
            sig == 0x02cfc753 || // setSplits(uint256,(uint256,uint32)[])
            sig == 0x69610257 || // emitAccountMetadata(uint256,(bytes32,bytes)[])
            sig == 0xf11d5139 || // MAX_SPLITS_RECEIVERS()
            sig == 0xa69aff3c    // TOTAL_SPLITS_WEIGHT()
        ) {
            return FACET_B;
        }
        // Everything else goes to FacetA (streams, drivers, balances, admin, managed)
        return FACET_A;
    }

    // =========================================================================
    // Privacy admin
    // =========================================================================

    /// @notice Register or update the ZW wrapper for an underlying token.
    /// @param underlying The plain ERC-20 token (e.g. USDC, USDT).
    /// @param zwToken    The ERC-8065 wrapper contract that wraps `underlying`.
    function registerZwToken(IERC20 underlying, IERC8065 zwToken) external onlyPrivacyAdmin {
        zwTokens[underlying] = zwToken;
        emit ZwTokenRegistered(underlying, zwToken);
    }

    // =========================================================================
    // Privacy account ID (mirrors AddressDriver packing)
    // =========================================================================

    /// @notice Compute the Drips account ID for a given address under this router's driver ID.
    /// @dev Packing: upper 32 bits = DRIVER_ID, lower 160 bits = addr.
    function calcAccountId(address addr) public view returns (uint256 accountId) {
        accountId = DRIVER_ID;
        accountId = (accountId << 224) | uint160(addr);
    }

    // =========================================================================
    // Privacy internal helpers
    // =========================================================================

    /// @dev Resolve ZW wrapper for `erc20`, reverting if not registered.
    function _zwToken(IERC20 erc20) internal view returns (IERC8065 zwToken) {
        zwToken = zwTokens[erc20];
        if (address(zwToken) == address(0)) revert ZwTokenNotRegistered(erc20);
    }

    /// @dev Delegatecall to FACET_A and bubble up any revert.
    ///      Returns the raw returndata bytes for the caller to decode.
    function _delegateA(bytes memory data) internal returns (bytes memory) {
        (bool ok, bytes memory ret) = FACET_A.delegatecall(data);
        if (!ok) {
            // Bubble up the revert reason.
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }

    /// @dev Delegatecall to FACET_B and bubble up any revert.
    function _delegateB(bytes memory data) internal returns (bytes memory) {
        (bool ok, bytes memory ret) = FACET_B.delegatecall(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }

    // =========================================================================
    // Privacy stream operations
    // =========================================================================
    function _processPrivateDeposit(
        uint256 accountId,
        IERC20 erc20,
        IERC8065 zwToken,
        int128 balanceDelta
    ) private {
        uint128 depositAmt = uint128(balanceDelta);

        // 1. Pull underlying from caller
        erc20.safeTransferFrom(msg.sender, address(this), depositAmt);
        erc20.safeApprove(address(zwToken), 0);
        erc20.safeApprove(address(zwToken), depositAmt);

        // 2. Mint ZWT -> address(this)
        zwToken.deposit(address(this), 0, depositAmt, "");
        erc20.safeApprove(address(zwToken), 0);
    }

    function _processPrivateWithdrawal(IERC8065 zwToken, address transferTo, int128 realBalanceDelta) private {
        // ── Step 5: pull returned ZWT out of Drips internal balance ───────
        uint128 returnedAmt = uint128(-realBalanceDelta);
        IERC20 zwERC20 = IERC20(address(zwToken));

        // Delegatecall FacetA.withdraw — moves ZWT from Drips balance to address(this).
        _delegateA(abi.encodeCall(IDrips.withdraw, (zwERC20, address(this), returnedAmt)));

        // Burn ZWT → send underlying directly to transferTo.
        zwERC20.safeApprove(address(zwToken), 0);
        zwERC20.safeApprove(address(zwToken), returnedAmt);
        zwToken.withdraw(transferTo, 0, returnedAmt, "");
        zwERC20.safeApprove(address(zwToken), 0);
    }

    /// @notice Set streams using privacy-wrapped tokens.
    ///
    /// When `balanceDelta > 0` (adding funds):
    ///   1. Pull `balanceDelta` underlying tokens from caller.
    ///   2. Approve ZWERC20 to spend exactly that amount.
    ///   3. Call ZWERC20.deposit → ZWT minted to this contract.
    ///   4. ZWT already sits in address(this) (the Drips proxy); DRIPS storage credits it.
    ///   5. Delegatecall FacetA.setStreams with the ZW token.
    ///
    /// When `balanceDelta < 0` (withdrawing surplus):
    ///   1. Delegatecall FacetA.setStreams (no tokens pulled).
    ///   2. Delegatecall FacetA.withdraw to move ZWT out of Drips internal balance to address(this).
    ///   3. Unwrap ZWT → underlying → forward to `transferTo`.
    ///
    /// @param erc20          Underlying ERC-20 to stream with.
    /// @param currReceivers  Current stream receivers (must match on-chain state).
    /// @param balanceDelta   Positive = top-up, negative = pull surplus back.
    /// @param newReceivers   Desired new stream receivers.
    /// @param maxEndHint1    Gas optimisation hint (pass 0 if unsure).
    /// @param maxEndHint2    Gas optimisation hint (pass 0 if unsure).
    /// @param transferTo     Recipient of any withdrawn underlying tokens.
    /// @return realBalanceDelta Actual balance change applied.
    function setStreamsPrivate(
        IERC20 erc20,
        StreamReceiver[] calldata currReceivers,
        int128 balanceDelta,
        StreamReceiver[] calldata newReceivers,
        uint32 maxEndHint1,
        uint32 maxEndHint2,
        address transferTo
    ) public returns (int128 realBalanceDelta) {
        if (transferTo == address(0)) revert ZeroAddress();
        IERC8065 zwToken = _zwToken(erc20);

        if (balanceDelta > 0) {
            _processPrivateDeposit(calcAccountId(msg.sender), erc20, zwToken, balanceDelta);
        }

        realBalanceDelta = IDrips(address(this)).setStreams(
            calcAccountId(msg.sender), IERC20(address(zwToken)), currReceivers, balanceDelta, newReceivers, maxEndHint1, maxEndHint2
        );

        if (realBalanceDelta < 0) {
            _processPrivateWithdrawal(zwToken, transferTo, realBalanceDelta);
        }

        emit PrivateStreamSet(calcAccountId(msg.sender), zwToken, realBalanceDelta);
    }

    /// @notice Collect streaming earnings as ZWT, then optionally unlink (remint) or unwrap.
    ///
    /// Flow:
    ///   1. Delegatecall FacetB.collect → ZWT credited inside Drips internal balance.
    ///   2. Delegatecall FacetA.withdraw → ZWT moves to address(this).
    ///   3a. If `doRemint`: call ZWERC20.remint(to, 0, amt, remintData).
    ///   3b. If not `doRemint` and `redeemRaw`: call ZWERC20.withdraw → underlying → transferTo.
    ///   3c. If both false: transfer ZWT directly to transferTo.
    ///
    /// @param erc20      Underlying ERC-20 token.
    /// @param transferTo Recipient of the final tokens.
    /// @param doRemint   If true, use ZK proof to break the on-chain source link.
    /// @param remintData Remint proof data (only used when doRemint == true).
    /// @param redeemRaw  When doRemint == false and redeemRaw == true, unwrap ZWT → underlying.
    ///                   When both are false, transferTo receives ZWT directly.
    /// @return amt Amount of ZWT collected.
    function collectPrivate(
        IERC20 erc20,
        address transferTo,
        bool doRemint,
        IERC8065.RemintData calldata remintData,
        bool redeemRaw
    ) public returns (uint128 amt) {
        if (transferTo == address(0)) revert ZeroAddress();
        IERC8065 zwToken = _zwToken(erc20);
        IERC20 zwERC20 = IERC20(address(zwToken));
        uint256 accountId = calcAccountId(msg.sender);

        // ── Step 1: collect ZWT — credits Drips internal balance ─────────────
        amt = IDrips(address(this)).collect(accountId, zwERC20);
        if (amt == 0) return 0;

        // ── Step 2: withdraw ZWT from Drips internal balance to address(this) ─
        _delegateA(abi.encodeCall(IDrips.withdraw, (zwERC20, address(this), amt)));

        if (doRemint) {
            // ── Step 3a: ZK remint — breaks on-chain link ────────────────────
            zwERC20.safeApprove(address(zwToken), 0);
            zwERC20.safeApprove(address(zwToken), amt);
            zwToken.remint(transferTo, 0, amt, remintData);
        } else if (redeemRaw) {
            // ── Step 3b: plain unwrap — burn ZWT, get underlying ─────────────
            zwERC20.safeApprove(address(zwToken), 0);
            zwERC20.safeApprove(address(zwToken), amt);
            zwToken.withdraw(transferTo, 0, amt, "");
        } else {
            // ── Step 3c: raw ZWT passthrough ─────────────────────────────────
            zwERC20.safeTransfer(transferTo, amt);
        }

        emit PrivateCollected(accountId, zwToken, amt);
    }

    /// @notice Wrap underlying tokens and give them immediately to another Drips account.
    ///
    /// Flow:
    ///   1. Pull `amt` underlying from caller.
    ///   2. Deposit → mint ZWT to address(this) (the Drips proxy).
    ///   3. Delegatecall FacetB.give(accountId, receiver, zwToken, amt).
    ///
    /// @param receiver Recipient Drips account ID.
    /// @param erc20    Underlying ERC-20 to give.
    /// @param amt      Amount to give.
    function givePrivate(
        uint256 receiver,
        IERC20 erc20,
        uint128 amt
    ) public {
        if (amt == 0) revert ZeroAmount();
        IERC8065 zwToken = _zwToken(erc20);
        IERC20 zwERC20 = IERC20(address(zwToken));
        uint256 accountId = calcAccountId(msg.sender);

        // Pull underlying from caller.
        erc20.safeTransferFrom(msg.sender, address(this), amt);

        // Approve ZWERC20 and deposit; ZWT lands in address(this) = Drips proxy.
        erc20.safeApprove(address(zwToken), 0);
        erc20.safeApprove(address(zwToken), amt);
        zwToken.deposit(address(this), 0, amt, "");
        erc20.safeApprove(address(zwToken), 0);

        uint256 zwBal = zwERC20.balanceOf(address(this));
        if (zwBal > type(uint128).max) revert BalanceOverflow();

        // Delegatecall FacetB.give — tokens are already in address(this).
        IDrips(address(this)).give(accountId, receiver, zwERC20, uint128(zwBal));

        emit PrivateGiven(accountId, receiver, zwToken, uint128(zwBal));
    }

    // =========================================================================
    // Direct convenience wrappers (no streaming)
    // =========================================================================

    /// @notice Deposit underlying ERC-20, receive ZWT directly (no streaming).
    /// @dev Useful for users who want to hold ZWT in their own wallet first.
    /// @param erc20   The underlying token to wrap.
    /// @param amount  Amount of underlying to deposit.
    function deposit(IERC20 erc20, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        IERC8065 zwToken = _zwToken(erc20);

        erc20.safeTransferFrom(msg.sender, address(this), amount);
        erc20.safeApprove(address(zwToken), 0);
        erc20.safeApprove(address(zwToken), amount);
        // Mint ZWT directly to msg.sender.
        zwToken.deposit(msg.sender, 0, amount, "");
        // Reset underlying approval to 0 after deposit (clean state).
        erc20.safeApprove(address(zwToken), 0);
    }

    /// @notice Burn ZWT, receive underlying ERC-20 directly (no streaming).
    /// @dev Caller must hold and approve ZWT to this contract before calling.
    ///      Note: function name `withdraw` does NOT collide with the IDrips.withdraw
    ///      selector routed through the fallback — named functions always take
    ///      priority over fallback() in Solidity.
    /// @param erc20   The underlying token to unwrap into.
    /// @param amount  Amount of ZWT to burn.
    function withdraw(IERC20 erc20, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        IERC8065 zwToken = _zwToken(erc20);
        IERC20 zwERC20 = IERC20(address(zwToken));

        // Pull ZWT from caller into this contract.
        zwERC20.safeTransferFrom(msg.sender, address(this), amount);

        // Approve ZWERC20 to burn the ZWT and send underlying to msg.sender.
        zwERC20.safeApprove(address(zwToken), amount);
        zwToken.withdraw(msg.sender, 0, amount, "");
    }
}
