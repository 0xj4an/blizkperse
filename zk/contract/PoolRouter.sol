// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ShieldedPool} from "./ShieldedPool.sol";

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 wad) external;
    function transfer(address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Facade that routes deposits/withdrawals to the ShieldedPool for a given token.
///         Does not merge Merkle trees or liquidity across tokens.
///         Optional protocol fee (default 30 bps = 0.3%) charged on top of the note amount:
///         payer `transferFrom`s gross to router; router sends fee to treasury and amount to pool.
///         (Two user `transferFrom`s would cost more than one pull + two `transfer`s.)
contract PoolRouter is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error UnknownToken();
    error FeeTooHigh();
    error BadMsgValue();
    error UnwrapRecipient();
    error NativeTransferFailed();
    error FeeTransferFailed();
    error WrappedUnset();
    error WrongPublicInputs();

    uint256 public constant FEE_BPS_DENOM = 10_000;
    uint256 public constant MAX_FEE_BPS = 1_000; // 10% hard cap

    mapping(address => address) public poolOf; // token => ShieldedPool
    /// @dev WETH-style wrapper only (e.g. WMON). Leave zero on Celo — CELO is already ERC-20 via token duality.
    address public wrappedNative;
    /// @notice Protocol fee in basis points (30 = 0.3%). Zero disables fees.
    uint256 public feeBps;
    /// @notice Recipient of protocol fees. Required when feeBps > 0.
    address public treasury;

    event PoolRegistered(address indexed token, address indexed pool);
    event WrappedNativeUpdated(address indexed wrapped);
    event FeeConfigUpdated(uint256 feeBps, address treasury);
    event ProtocolFeeTaken(address indexed token, address indexed from, uint256 fee);
    event RoutedDeposit(
        address indexed user,
        address indexed token,
        address indexed pool,
        bytes32 commitment,
        uint256 amount,
        uint256 fee
    );
    event RoutedBatchDeposit(
        address indexed user,
        address indexed token,
        address indexed pool,
        uint256 totalAmount,
        uint256 fee,
        uint256 count
    );
    event RoutedWithdraw(address indexed user, address indexed token, address indexed pool);

    constructor(address _wrappedNative, uint256 _feeBps, address _treasury) Ownable(msg.sender) {
        wrappedNative = _wrappedNative;
        if (_wrappedNative != address(0)) {
            emit WrappedNativeUpdated(_wrappedNative);
        }
        _setFeeConfig(_feeBps, _treasury);
    }

    receive() external payable {}

    function setPool(address token, address pool) external onlyOwner {
        if (token == address(0) || pool == address(0)) revert ZeroAddress();
        poolOf[token] = pool;
        emit PoolRegistered(token, pool);
    }

    function setWrappedNative(address _wrappedNative) external onlyOwner {
        wrappedNative = _wrappedNative;
        emit WrappedNativeUpdated(_wrappedNative);
    }

    function setFeeConfig(uint256 _feeBps, address _treasury) external onlyOwner {
        _setFeeConfig(_feeBps, _treasury);
    }

    /// @notice Fee charged on top of `amount` (note / pool credit).
    function quoteFee(uint256 amount) public view returns (uint256) {
        if (feeBps == 0 || amount == 0) return 0;
        return (amount * feeBps) / FEE_BPS_DENOM;
    }

    /// @notice Total tokens (or native wei) the payer must send for a note of `amount`.
    function quoteGross(uint256 amount) external view returns (uint256) {
        return amount + quoteFee(amount);
    }

    function deposit(
        address token,
        bytes32 commitment,
        uint256 amount,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external nonReentrant {
        address pool = poolOf[token];
        if (pool == address(0)) revert UnknownToken();
        if (amount == 0) revert ZeroAmount();

        uint256 fee = quoteFee(amount);
        _pullGrossAndFund(token, pool, amount, fee);
        ShieldedPool(pool).depositFromRouter(msg.sender, commitment, amount, proof, publicInputs);

        emit RoutedDeposit(msg.sender, token, pool, commitment, amount, fee);
    }

    /// @notice Wrap native currency and deposit into the wrapped-native pool.
    ///         `msg.value` must equal `amount + fee` where `amount` is the note value.
    function depositNative(
        bytes32 commitment,
        uint256 amount,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external payable nonReentrant {
        address wtoken = wrappedNative;
        if (wtoken == address(0)) revert WrappedUnset();
        address pool = poolOf[wtoken];
        if (pool == address(0)) revert UnknownToken();
        if (amount == 0) revert ZeroAmount();

        uint256 fee = quoteFee(amount);
        if (msg.value != amount + fee) revert BadMsgValue();

        IWETH(wtoken).deposit{value: msg.value}();
        _splitWrapped(wtoken, pool, amount, fee);
        ShieldedPool(pool).depositFromRouter(msg.sender, commitment, amount, proof, publicInputs);

        emit RoutedDeposit(msg.sender, wtoken, pool, commitment, amount, fee);
    }

    /// @notice Private-mode batch deposit: one transferFrom of Σ+fee; pool gets Σ, treasury gets fee.
    function depositBatch(
        address token,
        bytes32[] calldata commitments,
        uint256[] calldata denominationIds,
        bytes[] calldata proofs,
        bytes32[][] calldata publicInputs
    ) external nonReentrant {
        address pool = poolOf[token];
        if (pool == address(0)) revert UnknownToken();

        uint256 n = commitments.length;
        uint256 total = ShieldedPool(pool).quoteBatch(denominationIds);
        uint256 fee = quoteFee(total);
        _pullGrossAndFund(token, pool, total, fee);
        ShieldedPool(pool).depositBatchFromRouter(msg.sender, commitments, denominationIds, proofs, publicInputs);
        emit RoutedBatchDeposit(msg.sender, token, pool, total, fee, n);
    }

    /// @notice Native Private batch into wrapped-native pool. `msg.value` must be `Σ + fee`.
    function depositBatchNative(
        bytes32[] calldata commitments,
        uint256[] calldata denominationIds,
        bytes[] calldata proofs,
        bytes32[][] calldata publicInputs
    ) external payable nonReentrant {
        address wtoken = wrappedNative;
        if (wtoken == address(0)) revert WrappedUnset();
        address pool = poolOf[wtoken];
        if (pool == address(0)) revert UnknownToken();

        uint256 n = commitments.length;
        uint256 total = ShieldedPool(pool).quoteBatch(denominationIds);
        uint256 fee = quoteFee(total);
        if (msg.value != total + fee) revert BadMsgValue();

        IWETH(wtoken).deposit{value: msg.value}();
        _splitWrapped(wtoken, pool, total, fee);
        ShieldedPool(pool).depositBatchFromRouter(msg.sender, commitments, denominationIds, proofs, publicInputs);
        emit RoutedBatchDeposit(msg.sender, wtoken, pool, total, fee, n);
    }

    /// @dev One transferFrom(user→router, amount+fee), then transfer fee→treasury and amount→pool.
    function _pullGrossAndFund(address token, address pool, uint256 amount, uint256 fee) internal {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount + fee);
        if (fee > 0) {
            IERC20(token).safeTransfer(treasury, fee);
            emit ProtocolFeeTaken(token, msg.sender, fee);
        }
        IERC20(token).safeTransfer(pool, amount);
    }

    function _splitWrapped(address wtoken, address pool, uint256 amount, uint256 fee) internal {
        if (fee > 0) {
            if (!IWETH(wtoken).transfer(treasury, fee)) revert FeeTransferFailed();
            emit ProtocolFeeTaken(wtoken, msg.sender, fee);
        }
        if (!IWETH(wtoken).transfer(pool, amount)) revert FeeTransferFailed();
    }

    /// @notice Forward withdraw to the token pool.
    /// @param unwrap If true, proof recipient MUST be this router; wrapped tokens are unwrapped
    ///               and native currency is sent to `msg.sender`.
    function withdraw(
        address token,
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bool unwrap
    ) external nonReentrant {
        address pool = poolOf[token];
        if (pool == address(0)) revert UnknownToken();

        if (!unwrap || token != wrappedNative) {
            ShieldedPool(pool).withdraw(proof, publicInputs);
            emit RoutedWithdraw(msg.sender, token, pool);
            return;
        }

        if (publicInputs.length != 5) revert WrongPublicInputs();
        uint256 amount = uint256(publicInputs[0]);
        address proofRecipient = address(uint160(uint256(publicInputs[4]) & type(uint160).max));
        if (proofRecipient != address(this)) revert UnwrapRecipient();

        ShieldedPool(pool).withdraw(proof, publicInputs);
        IWETH(token).withdraw(amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();

        emit RoutedWithdraw(msg.sender, token, pool);
    }

    /// @notice Forward Private-mode denomination withdraw. Public inputs[0] is denomination_id (not amount).
    function withdrawDenom(
        address token,
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bool unwrap
    ) external nonReentrant {
        address pool = poolOf[token];
        if (pool == address(0)) revert UnknownToken();

        if (!unwrap || token != wrappedNative) {
            ShieldedPool(pool).withdrawDenom(proof, publicInputs);
            emit RoutedWithdraw(msg.sender, token, pool);
            return;
        }

        if (publicInputs.length != 5) revert WrongPublicInputs();
        uint256 denominationId = uint256(publicInputs[0]);
        uint256 amount = ShieldedPool(pool).denominations(denominationId);
        address proofRecipient = address(uint160(uint256(publicInputs[4]) & type(uint160).max));
        if (proofRecipient != address(this)) revert UnwrapRecipient();

        ShieldedPool(pool).withdrawDenom(proof, publicInputs);
        IWETH(token).withdraw(amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();

        emit RoutedWithdraw(msg.sender, token, pool);
    }

    function _setFeeConfig(uint256 _feeBps, address _treasury) internal {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (_feeBps > 0 && _treasury == address(0)) revert ZeroAddress();
        feeBps = _feeBps;
        treasury = _treasury;
        emit FeeConfigUpdated(_feeBps, _treasury);
    }
}
