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
contract PoolRouter is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    mapping(address => address) public poolOf; // token => ShieldedPool
    /// @dev WETH-style wrapper only (e.g. WMON). Leave zero on Celo — CELO is already ERC-20 via token duality.
    address public wrappedNative;

    event PoolRegistered(address indexed token, address indexed pool);
    event WrappedNativeUpdated(address indexed wrapped);
    event RoutedDeposit(
        address indexed user,
        address indexed token,
        address indexed pool,
        bytes32 commitment,
        uint256 amount
    );
    event RoutedWithdraw(address indexed user, address indexed token, address indexed pool);

    constructor(address _wrappedNative) Ownable(msg.sender) {
        wrappedNative = _wrappedNative;
        if (_wrappedNative != address(0)) {
            emit WrappedNativeUpdated(_wrappedNative);
        }
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

        IERC20(token).safeTransferFrom(msg.sender, pool, amount);
        ShieldedPool(pool).depositFromRouter(msg.sender, commitment, amount, proof, publicInputs);

        emit RoutedDeposit(msg.sender, token, pool, commitment, amount);
    }

    /// @notice Wrap native currency and deposit into the wrapped-native pool.
    function depositNative(
        bytes32 commitment,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external payable nonReentrant {
        address wtoken = wrappedNative;
        require(wtoken != address(0), "wrapped native unset");
        address pool = poolOf[wtoken];
        require(pool != address(0), "unknown token");
        uint256 amount = msg.value;
        require(amount > 0, "amount=0");

        IWETH(wtoken).deposit{value: amount}();
        require(IWETH(wtoken).transfer(pool, amount), "wtransfer failed");
        ShieldedPool(pool).depositFromRouter(msg.sender, commitment, amount, proof, publicInputs);

        emit RoutedDeposit(msg.sender, wtoken, pool, commitment, amount);
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
}
