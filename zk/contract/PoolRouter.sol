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
///         payer sends `amount + fee`, pool receives `amount` (note value), treasury receives `fee`.
contract PoolRouter is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

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
        require(token != address(0) && pool != address(0), "zero addr");
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
        require(pool != address(0), "unknown token");
        require(amount > 0, "amount=0");

        uint256 fee = quoteFee(amount);
        uint256 gross = amount + fee;

        IERC20(token).safeTransferFrom(msg.sender, address(this), gross);
        if (fee > 0) {
            IERC20(token).safeTransfer(treasury, fee);
            emit ProtocolFeeTaken(token, msg.sender, fee);
        }
        IERC20(token).safeTransfer(pool, amount);
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
        require(wtoken != address(0), "wrapped native unset");
        address pool = poolOf[wtoken];
        require(pool != address(0), "unknown token");
        require(amount > 0, "amount=0");

        uint256 fee = quoteFee(amount);
        require(msg.value == amount + fee, "bad msg.value");

        IWETH(wtoken).deposit{value: msg.value}();
        if (fee > 0) {
            require(IWETH(wtoken).transfer(treasury, fee), "fee transfer failed");
            emit ProtocolFeeTaken(wtoken, msg.sender, fee);
        }
        require(IWETH(wtoken).transfer(pool, amount), "wtransfer failed");
        ShieldedPool(pool).depositFromRouter(msg.sender, commitment, amount, proof, publicInputs);

        emit RoutedDeposit(msg.sender, wtoken, pool, commitment, amount, fee);
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
        require(pool != address(0), "unknown token");

        if (!unwrap || token != wrappedNative) {
            ShieldedPool(pool).withdraw(proof, publicInputs);
            emit RoutedWithdraw(msg.sender, token, pool);
            return;
        }

        require(publicInputs.length == 5, "bad public inputs");
        uint256 amount = uint256(publicInputs[0]);
        address proofRecipient = address(uint160(uint256(publicInputs[4]) & type(uint160).max));
        require(proofRecipient == address(this), "unwrap recipient must be router");

        ShieldedPool(pool).withdraw(proof, publicInputs);
        IWETH(token).withdraw(amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "native transfer failed");

        emit RoutedWithdraw(msg.sender, token, pool);
    }

    function _setFeeConfig(uint256 _feeBps, address _treasury) internal {
        require(_feeBps <= MAX_FEE_BPS, "fee too high");
        if (_feeBps > 0) {
            require(_treasury != address(0), "treasury=0");
        }
        feeBps = _feeBps;
        treasury = _treasury;
        emit FeeConfigUpdated(_feeBps, _treasury);
    }
}
