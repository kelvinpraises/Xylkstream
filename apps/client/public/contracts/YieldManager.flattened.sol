// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0 ^0.8.1 ^0.8.20;

// lib/openzeppelin-contracts/contracts/utils/Address.sol

// OpenZeppelin Contracts (last updated v4.9.0) (utils/Address.sol)

/**
 * @dev Collection of functions related to the address type
 */
library Address {
    /**
     * @dev Returns true if `account` is a contract.
     *
     * [IMPORTANT]
     * ====
     * It is unsafe to assume that an address for which this function returns
     * false is an externally-owned account (EOA) and not a contract.
     *
     * Among others, `isContract` will return false for the following
     * types of addresses:
     *
     *  - an externally-owned account
     *  - a contract in construction
     *  - an address where a contract will be created
     *  - an address where a contract lived, but was destroyed
     *
     * Furthermore, `isContract` will also return true if the target contract within
     * the same transaction is already scheduled for destruction by `SELFDESTRUCT`,
     * which only has an effect at the end of a transaction.
     * ====
     *
     * [IMPORTANT]
     * ====
     * You shouldn't rely on `isContract` to protect against flash loan attacks!
     *
     * Preventing calls from contracts is highly discouraged. It breaks composability, breaks support for smart wallets
     * like Gnosis Safe, and does not provide security since it can be circumvented by calling from a contract
     * constructor.
     * ====
     */
    function isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize/address.code.length, which returns 0
        // for contracts in construction, since the code is only stored at the end
        // of the constructor execution.

        return account.code.length > 0;
    }

    /**
     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to
     * `recipient`, forwarding all available gas and reverting on errors.
     *
     * https://eips.ethereum.org/EIPS/eip-1884[EIP1884] increases the gas cost
     * of certain opcodes, possibly making contracts go over the 2300 gas limit
     * imposed by `transfer`, making them unable to receive funds via
     * `transfer`. {sendValue} removes this limitation.
     *
     * https://consensys.net/diligence/blog/2019/09/stop-using-soliditys-transfer-now/[Learn more].
     *
     * IMPORTANT: because control is transferred to `recipient`, care must be
     * taken to not create reentrancy vulnerabilities. Consider using
     * {ReentrancyGuard} or the
     * https://solidity.readthedocs.io/en/v0.8.0/security-considerations.html#use-the-checks-effects-interactions-pattern[checks-effects-interactions pattern].
     */
    function sendValue(address payable recipient, uint256 amount) internal {
        require(address(this).balance >= amount, "Address: insufficient balance");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Address: unable to send value, recipient may have reverted");
    }

    /**
     * @dev Performs a Solidity function call using a low level `call`. A
     * plain `call` is an unsafe replacement for a function call: use this
     * function instead.
     *
     * If `target` reverts with a revert reason, it is bubbled up by this
     * function (like regular Solidity function calls).
     *
     * Returns the raw returned data. To convert to the expected return value,
     * use https://solidity.readthedocs.io/en/latest/units-and-global-variables.html?highlight=abi.decode#abi-encoding-and-decoding-functions[`abi.decode`].
     *
     * Requirements:
     *
     * - `target` must be a contract.
     * - calling `target` with `data` must not revert.
     *
     * _Available since v3.1._
     */
    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0, "Address: low-level call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`], but with
     * `errorMessage` as a fallback revert reason when `target` reverts.
     *
     * _Available since v3.1._
     */
    function functionCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but also transferring `value` wei to `target`.
     *
     * Requirements:
     *
     * - the calling contract must have an ETH balance of at least `value`.
     * - the called Solidity function must be `payable`.
     *
     * _Available since v3.1._
     */
    function functionCallWithValue(address target, bytes memory data, uint256 value) internal returns (bytes memory) {
        return functionCallWithValue(target, data, value, "Address: low-level call with value failed");
    }

    /**
     * @dev Same as {xref-Address-functionCallWithValue-address-bytes-uint256-}[`functionCallWithValue`], but
     * with `errorMessage` as a fallback revert reason when `target` reverts.
     *
     * _Available since v3.1._
     */
    function functionCallWithValue(
        address target,
        bytes memory data,
        uint256 value,
        string memory errorMessage
    ) internal returns (bytes memory) {
        require(address(this).balance >= value, "Address: insufficient balance for call");
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResultFromTarget(target, success, returndata, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a static call.
     *
     * _Available since v3.3._
     */
    function functionStaticCall(address target, bytes memory data) internal view returns (bytes memory) {
        return functionStaticCall(target, data, "Address: low-level static call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-string-}[`functionCall`],
     * but performing a static call.
     *
     * _Available since v3.3._
     */
    function functionStaticCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal view returns (bytes memory) {
        (bool success, bytes memory returndata) = target.staticcall(data);
        return verifyCallResultFromTarget(target, success, returndata, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a delegate call.
     *
     * _Available since v3.4._
     */
    function functionDelegateCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionDelegateCall(target, data, "Address: low-level delegate call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-string-}[`functionCall`],
     * but performing a delegate call.
     *
     * _Available since v3.4._
     */
    function functionDelegateCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        (bool success, bytes memory returndata) = target.delegatecall(data);
        return verifyCallResultFromTarget(target, success, returndata, errorMessage);
    }

    /**
     * @dev Tool to verify that a low level call to smart-contract was successful, and revert (either by bubbling
     * the revert reason or using the provided one) in case of unsuccessful call or if target was not a contract.
     *
     * _Available since v4.8._
     */
    function verifyCallResultFromTarget(
        address target,
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal view returns (bytes memory) {
        if (success) {
            if (returndata.length == 0) {
                // only check isContract if the call was successful and the return data is empty
                // otherwise we already know that it was a contract
                require(isContract(target), "Address: call to non-contract");
            }
            return returndata;
        } else {
            _revert(returndata, errorMessage);
        }
    }

    /**
     * @dev Tool to verify that a low level call was successful, and revert if it wasn't, either by bubbling the
     * revert reason or using the provided one.
     *
     * _Available since v4.3._
     */
    function verifyCallResult(
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal pure returns (bytes memory) {
        if (success) {
            return returndata;
        } else {
            _revert(returndata, errorMessage);
        }
    }

    function _revert(bytes memory returndata, string memory errorMessage) private pure {
        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {
            // The easiest way to bubble the revert reason is using memory via assembly
            /// @solidity memory-safe-assembly
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert(errorMessage);
        }
    }
}

// lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol

// OpenZeppelin Contracts (last updated v4.9.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `from` to `to` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// lib/openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Permit.sol

// OpenZeppelin Contracts (last updated v4.9.4) (token/ERC20/extensions/IERC20Permit.sol)

/**
 * @dev Interface of the ERC20 Permit extension allowing approvals to be made via signatures, as defined in
 * https://eips.ethereum.org/EIPS/eip-2612[EIP-2612].
 *
 * Adds the {permit} method, which can be used to change an account's ERC20 allowance (see {IERC20-allowance}) by
 * presenting a message signed by the account. By not relying on {IERC20-approve}, the token holder account doesn't
 * need to send a transaction, and thus is not required to hold Ether at all.
 *
 * ==== Security Considerations
 *
 * There are two important considerations concerning the use of `permit`. The first is that a valid permit signature
 * expresses an allowance, and it should not be assumed to convey additional meaning. In particular, it should not be
 * considered as an intention to spend the allowance in any specific way. The second is that because permits have
 * built-in replay protection and can be submitted by anyone, they can be frontrun. A protocol that uses permits should
 * take this into consideration and allow a `permit` call to fail. Combining these two aspects, a pattern that may be
 * generally recommended is:
 *
 * ```solidity
 * function doThingWithPermit(..., uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) public {
 *     try token.permit(msg.sender, address(this), value, deadline, v, r, s) {} catch {}
 *     doThing(..., value);
 * }
 *
 * function doThing(..., uint256 value) public {
 *     token.safeTransferFrom(msg.sender, address(this), value);
 *     ...
 * }
 * ```
 *
 * Observe that: 1) `msg.sender` is used as the owner, leaving no ambiguity as to the signer intent, and 2) the use of
 * `try/catch` allows the permit to fail and makes the code tolerant to frontrunning. (See also
 * {SafeERC20-safeTransferFrom}).
 *
 * Additionally, note that smart contract wallets (such as Argent or Safe) are not able to produce permit signatures, so
 * contracts should have entry points that don't rely on permit.
 */
interface IERC20Permit {
    /**
     * @dev Sets `value` as the allowance of `spender` over ``owner``'s tokens,
     * given ``owner``'s signed approval.
     *
     * IMPORTANT: The same issues {IERC20-approve} has related to transaction
     * ordering also apply here.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `deadline` must be a timestamp in the future.
     * - `v`, `r` and `s` must be a valid `secp256k1` signature from `owner`
     * over the EIP712-formatted function arguments.
     * - the signature must use ``owner``'s current nonce (see {nonces}).
     *
     * For more information on the signature format, see the
     * https://eips.ethereum.org/EIPS/eip-2612#specification[relevant EIP
     * section].
     *
     * CAUTION: See Security Considerations above.
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @dev Returns the current nonce for `owner`. This value must be
     * included whenever a signature is generated for {permit}.
     *
     * Every successful call to {permit} increases ``owner``'s nonce by one. This
     * prevents a signature from being used multiple times.
     */
    function nonces(address owner) external view returns (uint256);

    /**
     * @dev Returns the domain separator used in the encoding of the signature for {permit}, as defined by {EIP712}.
     */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

// lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol

// OpenZeppelin Contracts (last updated v4.9.3) (token/ERC20/utils/SafeERC20.sol)

/**
 * @title SafeERC20
 * @dev Wrappers around ERC20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    using Address for address;

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
    }

    /**
     * @dev Deprecated. This function has issues similar to the ones found in
     * {IERC20-approve}, and its usage is discouraged.
     *
     * Whenever possible, use {safeIncreaseAllowance} and
     * {safeDecreaseAllowance} instead.
     */
    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        // safeApprove should only be called when setting an initial allowance,
        // or when resetting it to zero. To increase and decrease it, use
        // 'safeIncreaseAllowance' and 'safeDecreaseAllowance'
        require(
            (value == 0) || (token.allowance(address(this), spender) == 0),
            "SafeERC20: approve from non-zero to non-zero allowance"
        );
        _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, value));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, oldAllowance + value));
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        unchecked {
            uint256 oldAllowance = token.allowance(address(this), spender);
            require(oldAllowance >= value, "SafeERC20: decreased allowance below zero");
            _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, oldAllowance - value));
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeWithSelector(token.approve.selector, spender, value);

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, 0));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Use a ERC-2612 signature to set the `owner` approval toward `spender` on `token`.
     * Revert on invalid signature.
     */
    function safePermit(
        IERC20Permit token,
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        uint256 nonceBefore = token.nonces(owner);
        token.permit(owner, spender, value, deadline, v, r, s);
        uint256 nonceAfter = token.nonces(owner);
        require(nonceAfter == nonceBefore + 1, "SafeERC20: permit did not succeed");
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves. We use {Address-functionCall} to perform this call, which verifies that
        // the target address contains contract code and also asserts for success in the low-level call.

        bytes memory returndata = address(token).functionCall(data, "SafeERC20: low-level call failed");
        require(returndata.length == 0 || abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silents catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves. We cannot use {Address-functionCall} here since this should return false
        // and not revert is the subcall reverts.

        (bool success, bytes memory returndata) = address(token).call(data);
        return
            success && (returndata.length == 0 || abi.decode(returndata, (bool))) && Address.isContract(address(token));
    }
}

// src/YieldManager.sol

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
        uint256 accountId;
        address strategy;
        IERC20 token;
        uint128 amount;
        address transferTo;
        bool consumed;
    }

    address public immutable dripsContract;
    address public immutable owner;

    /// token => Account (per-token accounting)
    mapping(IERC20 => Account) public accounts;

    /// token => strategy => Position
    mapping(IERC20 => mapping(address => Position)) public positions;

    /// Pending force withdrawals (accountId => WithdrawalState)
    mapping(uint256 => WithdrawalState) public pendingWithdrawals;

    // ═══════════════════════════════════════════════════════════════════════════════
    //                                  EVENTS
    // ═══════════════════════════════════════════════════════════════════════════════

    event DepositedFromDrips(IERC20 indexed token, uint256 amount);
    event PositionOpened(IERC20 indexed token, address indexed strategy, uint256 amount);
    event PositionClosed(IERC20 indexed token, address indexed strategy, uint256 amount, uint256 withdrawn);
    event ForcedWithdrawForRecipient(
        uint256 indexed accountId,
        IERC20 indexed token,
        address indexed strategy,
        uint256 amount
    );
    event ReturnedPrincipalToDrips(IERC20 indexed token, uint256 amount);
    event YieldClaimed(IERC20 indexed token, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════════════════
    //                              INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════════

    constructor(address _dripsContract) {
        dripsContract = _dripsContract;
        owner = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                              MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAuthorized();
        _;
    }

    modifier onlyDrips() {
        if (msg.sender != dripsContract) revert OnlyDrips();
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                    DRIPS INTEGRATION (Drips-only)
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @notice Deposit funds from Drips to YieldManager
    /// @dev Called by Drips contract when owner transfers idle balance
    function dripsDeposit(IERC20 token, uint256 amount) external onlyDrips {
        Account storage account = accounts[token];
        account.principal += uint128(amount);
        account.liquidBalance += uint128(amount);

        emit DepositedFromDrips(token, amount);
    }

    /// @notice Return principal to Drips
    /// @dev Called by Drips contract to reclaim principal
    function dripsReturn(IERC20 token, uint256 amount) external onlyDrips {
        Account storage account = accounts[token];

        // Can only return up to principal
        if (amount > account.principal) revert ExceedsPrincipal();

        // Must have liquid balance
        if (amount > account.liquidBalance) revert InsufficientLiquid();

        // Transfer to Drips
        token.safeTransfer(dripsContract, amount);

        // Reduce both principal and liquid
        account.principal -= uint128(amount);
        account.liquidBalance -= uint128(amount);

        emit ReturnedPrincipalToDrips(token, amount);
    }

    /// @notice Force withdrawal for recipient (clawback mechanism)
    /// @dev Called by Drips contract after collect() accounting when recipient claims streamed funds
    /// @dev Creates withdrawal state that must be consumed by calling completeForceWithdrawal
    /// @dev User must call strategy to withdraw and consume the withdrawal state
    function dripsForceWithdraw(
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
            accountId: accountId,
            strategy: strategy,
            token: token,
            amount: amount,
            transferTo: transferTo,
            consumed: false
        });
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

        // Get position
        Position storage position = positions[token][strategy];
        if (position.strategy == address(0)) revert PositionNotFound();

        // Determine principal to deduct (min of amount or position.amount)
        principalWithdrawn = uint128(_min(amount, position.amount));

        // Update position
        position.amount -= principalWithdrawn;

        // Update accounting
        Account storage account = accounts[token];
        account.investedBalance -= principalWithdrawn;

        // Mark as consumed
        state.consumed = true;

        // Transfer to recipient
        token.safeTransfer(state.transferTo, amount);

        // Clean up state
        delete pendingWithdrawals[accountId];

        emit ForcedWithdrawForRecipient(accountId, token, strategy, principalWithdrawn);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                    POSITION MANAGEMENT (owner-initiated)
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @notice Open position - invest via strategy
    /// @dev Strategy receives tokens and returns position data
    function positionOpen(
        IERC20 token,
        address strategy,
        uint256 amount,
        bytes calldata strategyData
    ) external onlyOwner {
        Account storage account = accounts[token];
        if (amount > account.liquidBalance) revert InsufficientLiquid();

        // Transfer tokens to strategy
        token.safeTransfer(strategy, amount);

        // Call strategy to execute investment
        bytes memory positionData = IYieldStrategy(strategy).invest(amount, strategyData);

        // Store position
        positions[token][strategy] = Position({
            strategy: strategy,
            token: token,
            amount: uint128(amount),
            positionData: positionData
        });

        // Update accounting: liquid -> invested
        account.liquidBalance -= uint128(amount);
        account.investedBalance += uint128(amount);

        emit PositionOpened(token, strategy, amount);
    }

    /// @notice Close position - withdraw from strategy
    /// @dev Strategy returns tokens including fees, YieldManager calculates principal vs yield
    function positionClose(
        IERC20 token,
        address strategy,
        bytes calldata strategyData
    ) external onlyOwner {
        Position storage position = positions[token][strategy];
        if (position.strategy == address(0)) revert PositionNotFound();

        // Call strategy to withdraw entire position (includes collecting fees)
        uint256 withdrawn = IYieldStrategy(strategy).withdraw(
            position.positionData,
            position.amount,
            strategyData
        );

        // Determine principal to deduct (min of withdrawn or position.amount)
        // If withdrawn > position.amount, the extra is yield (including fees)
        uint128 principalWithdrawn = uint128(_min(withdrawn, position.amount));

        // Update position
        position.amount -= principalWithdrawn;

        // Update accounting: invested -> liquid (may increase if yield earned)
        Account storage account = accounts[token];
        account.investedBalance -= principalWithdrawn;
        account.liquidBalance += uint128(withdrawn);

        emit PositionClosed(token, strategy, principalWithdrawn, withdrawn);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                    YIELD MANAGEMENT (owner-initiated)
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @notice Claim yield earned on positions
    /// @dev Can only claim yield that is in liquid balance
    function yieldClaim(IERC20 token, address recipient) external onlyOwner {
        Account storage account = accounts[token];

        // Calculate yield
        uint256 total = uint256(account.liquidBalance) + uint256(account.investedBalance);
        if (total < account.principal) revert NoYield();
        uint256 yieldAmount = total - account.principal;

        // Must have liquid balance to withdraw
        if (yieldAmount > account.liquidBalance) revert InsufficientLiquid();

        // Transfer yield to recipient
        token.safeTransfer(recipient, yieldAmount);

        // Reduce liquid balance only
        account.liquidBalance -= uint128(yieldAmount);

        emit YieldClaimed(token, yieldAmount);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                           VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @notice Get account balances for a token
    function getBalances(IERC20 token)
        external
        view
        returns (uint128 principal, uint128 liquidBalance, uint128 investedBalance)
    {
        Account storage account = accounts[token];
        return (account.principal, account.liquidBalance, account.investedBalance);
    }

    /// @notice Get position details
    function getPosition(IERC20 token, address strategy)
        external
        view
        returns (address strategyAddr, uint128 amount, bytes memory positionData)
    {
        Position storage position = positions[token][strategy];
        return (position.strategy, position.amount, position.positionData);
    }

    /// @notice Calculate yield for a token
    function calculateYield(IERC20 token) external view returns (uint256) {
        Account storage account = accounts[token];
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

