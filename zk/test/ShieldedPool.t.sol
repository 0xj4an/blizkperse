// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {ShieldedPool} from "../contract/ShieldedPool.sol";
import {PoolRouter} from "../contract/PoolRouter.sol";
import {MockVerifier} from "./MockVerifier.sol";
import {MockERC20} from "./MockERC20.sol";
import {MockWETH} from "./MockWETH.sol";

contract ShieldedPoolTest is Test {
    MockERC20 usdc;
    MockERC20 usdt;
    MockWETH weth;
    MockVerifier transferV;
    MockVerifier withdrawV;
    MockVerifier depositV;
    ShieldedPool poolUsdc;
    ShieldedPool poolUsdt;
    ShieldedPool poolWeth;
    PoolRouter router;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    bytes32 constant COMMIT_A = bytes32(uint256(0x1111));
    bytes32 constant COMMIT_B = bytes32(uint256(0x2222));

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdt = new MockERC20("Tether", "USDT", 6);
        weth = new MockWETH();
        transferV = new MockVerifier();
        withdrawV = new MockVerifier();
        depositV = new MockVerifier();

        poolUsdc = new ShieldedPool(address(usdc), address(transferV), bytes32(0), address(withdrawV), address(depositV));
        poolUsdt = new ShieldedPool(address(usdt), address(transferV), bytes32(0), address(withdrawV), address(depositV));
        poolWeth = new ShieldedPool(address(weth), address(transferV), bytes32(0), address(withdrawV), address(depositV));

        router = new PoolRouter(address(weth));
        poolUsdc.setRouter(address(router));
        poolUsdt.setRouter(address(router));
        poolWeth.setRouter(address(router));
        router.setPool(address(usdc), address(poolUsdc));
        router.setPool(address(usdt), address(poolUsdt));
        router.setPool(address(weth), address(poolWeth));

        usdc.mint(alice, 1_000_000e6);
        usdt.mint(alice, 1_000_000e6);
        vm.deal(alice, 100 ether);
    }

    function _depositInputs(uint256 amount, bytes32 commitment) internal pure returns (bytes32[] memory pi) {
        pi = new bytes32[](2);
        pi[0] = bytes32(amount);
        pi[1] = commitment;
    }

    function _withdrawInputs(uint256 amount, bytes32 nullifier, address recipient)
        internal
        pure
        returns (bytes32[] memory pi)
    {
        pi = new bytes32[](5);
        pi[0] = bytes32(amount);
        pi[1] = nullifier;
        pi[2] = bytes32(uint256(10));
        pi[3] = bytes32(0); // genesis root is known
        pi[4] = bytes32(uint256(uint160(recipient)));
    }

    function test_DepositAmountMismatchReverts() public {
        uint256 amount = 1e6;
        bytes32[] memory pi = _depositInputs(1e9, COMMIT_A); // value != amount
        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), amount);
        vm.expectRevert(bytes("value != amount"));
        poolUsdc.deposit(COMMIT_A, amount, hex"00", pi);
        vm.stopPrank();
    }

    function test_DepositAndWithdrawExactAmount() public {
        uint256 amount = 5e6;
        bytes32[] memory dpi = _depositInputs(amount, COMMIT_A);
        depositV.setDepositExpectation(bytes32(amount), COMMIT_A);

        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), amount);
        poolUsdc.deposit(COMMIT_A, amount, hex"00", dpi);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(poolUsdc)), amount);

        bytes32 nullifier = bytes32(uint256(0xabc));
        bytes32[] memory wpi = _withdrawInputs(amount, nullifier, bob);
        poolUsdc.withdraw(hex"00", wpi);
        assertEq(usdc.balanceOf(bob), amount);
        assertEq(usdc.balanceOf(address(poolUsdc)), 0);
    }

    function test_TwoPoolsLiquidityIsolated() public {
        uint256 amount = 10e6;
        depositV.setDepositExpectation(bytes32(amount), COMMIT_A);

        vm.startPrank(alice);
        usdc.approve(address(router), amount);
        router.deposit(address(usdc), COMMIT_A, amount, hex"00", _depositInputs(amount, COMMIT_A));
        vm.stopPrank();

        // Withdraw USDT note against USDT pool — USDT pool has 0 balance → transfer fails
        bytes32[] memory wpi = _withdrawInputs(amount, bytes32(uint256(1)), bob);
        vm.expectRevert();
        poolUsdt.withdraw(hex"00", wpi);

        // USDC pool still holds funds
        assertEq(usdc.balanceOf(address(poolUsdc)), amount);
        assertEq(usdt.balanceOf(address(poolUsdt)), 0);
    }

    function test_NullifierReuseReverts() public {
        uint256 amount = 2e6;
        depositV.setDepositExpectation(bytes32(amount), COMMIT_A);

        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), amount);
        poolUsdc.deposit(COMMIT_A, amount, hex"00", _depositInputs(amount, COMMIT_A));
        vm.stopPrank();

        bytes32 nullifier = bytes32(uint256(0xdead));
        bytes32[] memory wpi = _withdrawInputs(amount, nullifier, bob);
        poolUsdc.withdraw(hex"00", wpi);

        vm.expectRevert(bytes("nullifier used"));
        poolUsdc.withdraw(hex"00", wpi);
    }

    function test_RouterDepositUsdc() public {
        uint256 amount = 3e6;
        depositV.setDepositExpectation(bytes32(amount), COMMIT_B);

        vm.startPrank(alice);
        usdc.approve(address(router), amount);
        router.deposit(address(usdc), COMMIT_B, amount, hex"00", _depositInputs(amount, COMMIT_B));
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(poolUsdc)), amount);
        assertTrue(poolUsdc.usedCommitments(COMMIT_B));
    }

    function test_RouterDepositNative() public {
        uint256 amount = 1 ether;
        bytes32 commit = bytes32(uint256(0x3333));
        depositV.setDepositExpectation(bytes32(amount), commit);

        vm.prank(alice);
        router.depositNative{value: amount}(commit, hex"00", _depositInputs(amount, commit));

        assertEq(weth.balanceOf(address(poolWeth)), amount);
        assertTrue(poolWeth.usedCommitments(commit));
    }

    function test_DuplicateCommitmentReverts() public {
        uint256 amount = 1e6;
        depositV.setDepositExpectation(bytes32(amount), COMMIT_A);

        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), amount * 2);
        poolUsdc.deposit(COMMIT_A, amount, hex"00", _depositInputs(amount, COMMIT_A));
        vm.expectRevert(bytes("commitment already used"));
        poolUsdc.deposit(COMMIT_A, amount, hex"00", _depositInputs(amount, COMMIT_A));
        vm.stopPrank();
    }

    function test_UnknownTokenOnRouterReverts() public {
        vm.expectRevert(bytes("unknown token"));
        router.deposit(address(0x1234), COMMIT_A, 1, hex"00", _depositInputs(1, COMMIT_A));
    }
}
