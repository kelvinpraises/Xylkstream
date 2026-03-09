// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";

/// @title YieldManager
/// @notice Allows stream creators to earn yield on idle capital
/// @dev Uses extension pattern: users deploy custom strategies, YieldManager owns positions
/// @dev Single owner model - one YieldManager per enterprise/owner
contract YieldManager {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════════
    //                                   ERRORS
    // ═══════════════════════════════════════════════════════════════════════════════

    error NotAuthorized();
    error InsufficientLiquid();
    error ExceedsPrincipal();
    error NoYield();
    error PositionNotFound();
    error OnlyDrips();
    error WithdrawalNotFound();
    error AlreadyConsumed();
    error AmountMismatch();
    error WithdrawalPending();
    error WrongStrategy();
    error WrongToken();

    // ═══════════════════════════════════════════════════════════════════════════════
    //                              STORAGE & TYPES
    // ═══════════════════════════════════════════════════════════════════════════════

    struct Account {
        uint128 principal;        // Amount from Drips (must be returnable)
        uint128 liquidBalance;    // Tokens in vault
        uint128 investedBalance;  // Tokens in positions
        // Total = liquid + invested
        // Yield = Total - principal
    }

    struct Position {
        address strategy;
        IERC20 token;            // Token used in this position
        uint128 amount;
        bytes positionData;      // Strategy-specific position data
    }

    /// @notice Withdrawal state for force collect
    struct WithdrawalState {
        uint256 senderAccountId;
        uint256 accountId;
        address strategy;
        IERC20 token;
        uint128 amount;
        address transferTo;
        bool consumed;
    }

    address public immutable DRIPS_CONTRACT;
    address public immutable OWNER;

    /// senderAccountId => token => Account (per-sender, per-token accounting)
    mapping(uint256 => mapping(IERC20 => Account)) public accounts;

    /// senderAccountId => token => strategy => Position
    mapping(uint256 => mapping(IERC20 => mapping(address => Position))) public positions;

    /// Pending force withdrawals (accountId => WithdrawalState)
    mapping(uint256 => WithdrawalState) public pendingWithdrawals;

    // ═══════════════════════════════════════════════════════════════════════════════
    //                                  EVENTS
    // ═══════════════════════════════════════════════════════════════════════════════

    event DepositedFromDrips(uint256 indexed senderAccountId, IERC20 indexed token, uint256 amount);
    event PositionOpened(uint256 indexed senderAccountId, IERC20 indexed token, address indexed strategy, uint256 amount);
    event PositionClosed(uint256 indexed senderAccountId, IERC20 indexed token, address indexed strategy, uint256 amount, uint256 withdrawn);
    event ForcedWithdrawForRecipient(
        uint256 indexed senderAccountId,
        uint256 indexed accountId,
        IERC20 indexed token,
        address strategy,
        uint256 amount
    );
    event ReturnedPrincipalToDrips(uint256 indexed senderAccountId, IERC20 indexed token, uint256 amount);
    event YieldClaimed(uint256 indexed senderAccountId, IERC20 indexed token, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════════════════
    //                              INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════════

    constructor(address _dripsContract) {
        DRIPS_CONTRACT = _dripsContract;
        OWNER = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                              MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    modifier onlyDrips() {
        _onlyDrips();
        _;
    }

    function _onlyOwner() internal view {
        if (msg.sender != OWNER) revert NotAuthorized();
    }

    function _onlyDrips() internal view {
        if (msg.sender != DRIPS_CONTRACT) revert OnlyDrips();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                    DRIPS INTEGRATION (Drips-only)
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @notice Deposit funds from Drips to YieldManager
    /// @dev Called by Drips contract when owner transfers idle balance
    function dripsDeposit(uint256 senderAccountId, IERC20 token, uint256 amount) external onlyDrips {
        Account storage account = accounts[senderAccountId][token];
        // amount bounded by token balance and protocol limits
        // forge-lint: disable-next-line(unsafe-typecast)
        account.principal += uint128(amount);
        // amount bounded by token balance and protocol limits
        // forge-lint: disable-next-line(unsafe-typecast)
        account.liquidBalance += uint128(amount);

        emit DepositedFromDrips(senderAccountId, token, amount);
    }

    /// @notice Direct deposit by owner (for testing or direct funding)
    /// @dev Allows owner to deposit tokens directly without going through Drips
    /// @param senderAccountId The account ID of the sender
    /// @param token The ERC20 token to deposit
    /// @param amount The amount to deposit
    function ownerDeposit(uint256 senderAccountId, IERC20 token, uint256 amount) external onlyOwner {
        // Transfer tokens from owner to this contract
        token.safeTransferFrom(msg.sender, address(this), amount);

        Account storage account = accounts[senderAccountId][token];
        // amount bounded by token balance transferred
        // forge-lint: disable-next-line(unsafe-typecast)
        account.principal += uint128(amount);
        // amount bounded by token balance transferred
        // forge-lint: disable-next-line(unsafe-typecast)
        account.liquidBalance += uint128(amount);

        emit DepositedFromDrips(senderAccountId, token, amount); // Reuse event
    }

    /// @notice Return principal to Drips
    /// @dev Called by Drips contract to reclaim principal
    function dripsReturn(uint256 senderAccountId, IERC20 token, uint256 amount) external onlyDrips {
        Account storage account = accounts[senderAccountId][token];

        // Can only return up to principal
        if (amount > account.principal) revert ExceedsPrincipal();

        // Must have liquid balance
        if (amount > account.liquidBalance) revert InsufficientLiquid();

        // Transfer to Drips
        token.safeTransfer(DRIPS_CONTRACT, amount);

        // Reduce both principal and liquid
        // amount <= account.principal, safe to cast
        // forge-lint: disable-next-line(unsafe-typecast)
        account.principal -= uint128(amount);
        // amount <= account.liquidBalance, safe to cast
        // forge-lint: disable-next-line(unsafe-typecast)
        account.liquidBalance -= uint128(amount);

        emit ReturnedPrincipalToDrips(senderAccountId, token, amount);
    }

    /// @notice Force withdrawal for recipient (clawback mechanism)
    /// @dev Called by Drips contract after collect() accounting when recipient claims streamed funds
    /// @dev Creates withdrawal state that must be consumed by calling completeForceWithdrawal
    /// @dev User must call strategy to withdraw and consume the withdrawal state
    function dripsForceWithdraw(
        uint256 senderAccountId,
        uint256 accountId,
        IERC20 token,
        address strategy,
        uint128 amount,
        address transferTo
    ) external onlyDrips {
        // Check no pending withdrawal exists
        if (pendingWithdrawals[accountId].amount > 0) revert WithdrawalPending();

        // Store withdrawal state
        pendingWithdrawals[accountId] = WithdrawalState({
            senderAccountId: senderAccountId,
            accountId: accountId,
            strategy: strategy,
            token: token,
            amount: amount,
            transferTo: transferTo,
            consumed: false
        });

        emit ForcedWithdrawForRecipient(senderAccountId, accountId, token, strategy, amount);
    }

    /// @notice Complete withdrawal - consumes withdrawal state
    /// @dev Called by strategy after withdrawing from position
    /// @dev Verifies amount, updates accounting, transfers to recipient
    function completeForceWithdrawal(
        uint256 accountId,
        address strategy,
        IERC20 token,
        uint128 amount
    ) external returns (uint128 principalWithdrawn) {
        WithdrawalState storage state = pendingWithdrawals[accountId];

        // Verify withdrawal state exists
        if (state.amount == 0) revert WithdrawalNotFound();

        // Verify not already consumed
        if (state.consumed) revert AlreadyConsumed();

        // Verify amount matches
        if (state.amount != amount) revert AmountMismatch();

        // Verify strategy matches
        if (state.strategy != strategy) revert WrongStrategy();

        // Verify token matches
        if (state.token != token) revert WrongToken();

        // Read senderAccountId from stored state
        uint256 senderAccountId = state.senderAccountId;

        // Get position
        Position storage position = positions[senderAccountId][token][strategy];
        if (position.strategy == address(0)) revert PositionNotFound();

        // Determine principal to deduct (min of amount or position.amount)
        principalWithdrawn = uint128(_min(amount, position.amount));

        // Update position
        position.amount -= principalWithdrawn;

        // Update accounting
        Account storage account = accounts[senderAccountId][token];
        account.investedBalance -= principalWithdrawn;

        // Mark as consumed
        state.consumed = true;

        // Transfer to recipient
        token.safeTransfer(state.transferTo, amount);

        // Clean up state
        delete pendingWithdrawals[accountId];
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                    POSITION MANAGEMENT (owner-initiated)
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @notice Open position - invest via strategy
    /// @dev Strategy receives tokens and returns position data
    function positionOpen(
        uint256 senderAccountId,
        IERC20 token,
        address strategy,
        uint256 amount,
        bytes calldata strategyData
    ) external onlyOwner {
        Account storage account = accounts[senderAccountId][token];
        if (amount > account.liquidBalance) revert InsufficientLiquid();

        // Transfer tokens to strategy
        token.safeTransfer(strategy, amount);

        // Call strategy to execute investment
        bytes memory positionData = IYieldStrategy(strategy).invest(amount, strategyData);

        // Store position
        // amount <= account.liquidBalance, safe to cast
        // forge-lint: disable-next-line(unsafe-typecast)
        positions[senderAccountId][token][strategy] = Position({
            strategy: strategy,
            token: token,
            // amount <= account.liquidBalance, safe to cast
            // forge-lint: disable-next-line(unsafe-typecast)
            amount: uint128(amount),
            positionData: positionData
        });

        // Update accounting: liquid -> invested
        // amount <= account.liquidBalance, safe to cast
        // forge-lint: disable-next-line(unsafe-typecast)
        account.liquidBalance -= uint128(amount);
        // amount fits in uint128
        // forge-lint: disable-next-line(unsafe-typecast)
        account.investedBalance += uint128(amount);

        emit PositionOpened(senderAccountId, token, strategy, amount);
    }

    /// @notice Close position - withdraw from strategy
    /// @dev Strategy returns tokens including fees, YieldManager calculates principal vs yield
    function positionClose(
        uint256 senderAccountId,
        IERC20 token,
        address strategy,
        bytes calldata strategyData
    ) external onlyOwner {
        Position storage position = positions[senderAccountId][token][strategy];
        if (position.strategy == address(0)) revert PositionNotFound();

        // Call strategy to withdraw entire position (includes collecting fees)
        uint256 withdrawn = IYieldStrategy(strategy).withdraw(
            position.positionData,
            position.amount,
            strategyData
        );

        // Determine principal to deduct (min of withdrawn or position.amount)
        // If withdrawn > position.amount, the extra is yield (including fees)
        // _min result fits in uint128
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 principalWithdrawn = uint128(_min(withdrawn, position.amount));

        // Update position
        position.amount -= principalWithdrawn;

        // Update accounting: invested -> liquid (may increase if yield earned)
        Account storage account = accounts[senderAccountId][token];
        account.investedBalance -= principalWithdrawn;
        // withdrawn fits in uint128 (protocol bounded)
        // forge-lint: disable-next-line(unsafe-typecast)
        account.liquidBalance += uint128(withdrawn);

        emit PositionClosed(senderAccountId, token, strategy, principalWithdrawn, withdrawn);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                    YIELD MANAGEMENT (owner-initiated)
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @notice Claim yield earned on positions
    /// @dev Can only claim yield that is in liquid balance
    function yieldClaim(uint256 senderAccountId, IERC20 token, address recipient) external onlyOwner {
        Account storage account = accounts[senderAccountId][token];

        // Calculate yield
        uint256 total = uint256(account.liquidBalance) + uint256(account.investedBalance);
        if (total < account.principal) revert NoYield();
        uint256 yieldAmount = total - account.principal;

        // Must have liquid balance to withdraw
        if (yieldAmount > account.liquidBalance) revert InsufficientLiquid();

        // Transfer yield to recipient
        token.safeTransfer(recipient, yieldAmount);

        // Reduce liquid balance only
        // yieldAmount <= account.liquidBalance, safe to cast
        // forge-lint: disable-next-line(unsafe-typecast)
        account.liquidBalance -= uint128(yieldAmount);

        emit YieldClaimed(senderAccountId, token, yieldAmount);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                           VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @notice Get account balances for a token
    function getBalances(uint256 senderAccountId, IERC20 token)
        external
        view
        returns (uint128 principal, uint128 liquidBalance, uint128 investedBalance)
    {
        Account storage account = accounts[senderAccountId][token];
        return (account.principal, account.liquidBalance, account.investedBalance);
    }

    /// @notice Get position details
    function getPosition(uint256 senderAccountId, IERC20 token, address strategy)
        external
        view
        returns (address strategyAddr, uint128 amount, bytes memory positionData)
    {
        Position storage position = positions[senderAccountId][token][strategy];
        return (position.strategy, position.amount, position.positionData);
    }

    /// @notice Calculate yield for a token
    function calculateYield(uint256 senderAccountId, IERC20 token) external view returns (uint256) {
        Account storage account = accounts[senderAccountId][token];
        uint256 total = uint256(account.liquidBalance) + uint256(account.investedBalance);
        if (total < account.principal) return 0;
        return total - account.principal;
    }

    /// @notice Get withdrawal state (for strategy to read)
    function getWithdrawalState(uint256 accountId)
        external
        view
        returns (WithdrawalState memory)
    {
        if (pendingWithdrawals[accountId].amount == 0) revert WithdrawalNotFound();
        return pendingWithdrawals[accountId];
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                           INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @dev Returns the minimum of two uint256 values
    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

/// @title IYieldStrategy
/// @notice Interface that all yield strategies must implement
interface IYieldStrategy {
    /// @notice Invest - returns position data
    /// @param amount Amount to invest
    /// @param strategyData Strategy-specific data
    /// @return positionData Data representing the position
    function invest(uint256 amount, bytes calldata strategyData)
        external
        returns (bytes memory positionData);

    /// @notice Withdraw - returns amount withdrawn (including fees/yield)
    /// @dev Strategy should collect all fees before withdrawing
    /// @param positionData Data representing the position
    /// @param amount Amount to withdraw
    /// @param strategyData Strategy-specific data
    /// @return withdrawn Actual amount withdrawn (principal + fees/yield)
    function withdraw(bytes calldata positionData, uint256 amount, bytes calldata strategyData)
        external
        returns (uint256 withdrawn);
}
