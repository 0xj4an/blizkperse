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
    address treasury = address(0xFEE);

    bytes32 constant COMMIT_A = bytes32(uint256(0x1111));
    bytes32 constant COMMIT_B = bytes32(uint256(0x2222));

    uint256 constant FEE_BPS = 30; // 0.3%

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

        router = new PoolRouter(address(weth), FEE_BPS, treasury);
        poolUsdc.setRouter(address(router));
        poolUsdt.setRouter(address(router));
        poolWeth.setRouter(address(router));
        poolUsdc.setRootRegistrar(address(this));
        poolUsdt.setRootRegistrar(address(this));
        poolWeth.setRootRegistrar(address(this));
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
        vm.expectRevert(ShieldedPool.ValueMismatch.selector);
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
        uint256 fee = router.quoteFee(amount);
        depositV.setDepositExpectation(bytes32(amount), COMMIT_A);

        vm.startPrank(alice);
        usdc.approve(address(router), amount + fee);
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

        vm.expectRevert(ShieldedPool.NullifierUsed.selector);
        poolUsdc.withdraw(hex"00", wpi);
    }

    function test_RouterDepositUsdc() public {
        uint256 amount = 3e6;
        uint256 fee = router.quoteFee(amount);
        depositV.setDepositExpectation(bytes32(amount), COMMIT_B);

        vm.startPrank(alice);
        usdc.approve(address(router), amount + fee);
        router.deposit(address(usdc), COMMIT_B, amount, hex"00", _depositInputs(amount, COMMIT_B));
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(poolUsdc)), amount);
        assertEq(usdc.balanceOf(treasury), fee);
        assertTrue(poolUsdc.usedCommitments(COMMIT_B));
    }

    function test_RouterDepositTakesProtocolFee() public {
        uint256 amount = 100_000e6; // 100k USDC
        uint256 fee = (amount * FEE_BPS) / 10_000; // 0.3% = 300 USDC
        assertEq(fee, 300e6);
        depositV.setDepositExpectation(bytes32(amount), COMMIT_A);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.startPrank(alice);
        usdc.approve(address(router), amount + fee);
        router.deposit(address(usdc), COMMIT_A, amount, hex"00", _depositInputs(amount, COMMIT_A));
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), aliceBefore - amount - fee);
        assertEq(usdc.balanceOf(address(poolUsdc)), amount);
        assertEq(usdc.balanceOf(treasury), fee);
        assertEq(router.quoteGross(amount), amount + fee);
    }

    function test_RouterDepositNative() public {
        uint256 amount = 1 ether;
        uint256 fee = router.quoteFee(amount);
        bytes32 commit = bytes32(uint256(0x3333));
        depositV.setDepositExpectation(bytes32(amount), commit);

        vm.prank(alice);
        router.depositNative{value: amount + fee}(commit, amount, hex"00", _depositInputs(amount, commit));

        assertEq(weth.balanceOf(address(poolWeth)), amount);
        assertEq(weth.balanceOf(treasury), fee);
        assertTrue(poolWeth.usedCommitments(commit));
    }

    function test_RouterDepositNativeBadValueReverts() public {
        uint256 amount = 1 ether;
        bytes32 commit = bytes32(uint256(0x3333));
        depositV.setDepositExpectation(bytes32(amount), commit);

        vm.prank(alice);
        vm.expectRevert(PoolRouter.BadMsgValue.selector);
        router.depositNative{value: amount}(commit, amount, hex"00", _depositInputs(amount, commit));
    }

    function test_ZeroFeeSkipsTreasury() public {
        router.setFeeConfig(0, address(0));
        uint256 amount = 3e6;
        depositV.setDepositExpectation(bytes32(amount), COMMIT_B);

        vm.startPrank(alice);
        usdc.approve(address(router), amount);
        router.deposit(address(usdc), COMMIT_B, amount, hex"00", _depositInputs(amount, COMMIT_B));
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(poolUsdc)), amount);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_DuplicateCommitmentReverts() public {
        uint256 amount = 1e6;
        depositV.setDepositExpectation(bytes32(amount), COMMIT_A);

        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), amount * 2);
        poolUsdc.deposit(COMMIT_A, amount, hex"00", _depositInputs(amount, COMMIT_A));
        vm.expectRevert(ShieldedPool.CommitmentUsed.selector);
        poolUsdc.deposit(COMMIT_A, amount, hex"00", _depositInputs(amount, COMMIT_A));
        vm.stopPrank();
    }

    function test_UnknownTokenOnRouterReverts() public {
        vm.expectRevert(PoolRouter.UnknownToken.selector);
        router.deposit(address(0x1234), COMMIT_A, 1, hex"00", _depositInputs(1, COMMIT_A));
    }

    function test_RegisterRootOnlyRegistrar() public {
        bytes32 root = bytes32(uint256(0xbeef));
        vm.prank(alice);
        vm.expectRevert(ShieldedPool.OnlyRegistrar.selector);
        poolUsdc.registerRoot(root);

        poolUsdc.registerRoot(root); // test contract is registrar
        assertTrue(poolUsdc.isKnownRoot(root));

        vm.expectRevert(ShieldedPool.RootKnown.selector);
        poolUsdc.registerRoot(root);
    }

    function _stablesDenoms() internal pure returns (uint256[] memory d) {
        // Matches withdraw_denom.nr / private-amounts doc (6 decimals).
        d = new uint256[](11);
        d[0] = 50e6;
        d[1] = 100e6;
        d[2] = 250e6;
        d[3] = 500e6;
        d[4] = 1_000e6;
        d[5] = 2_500e6;
        d[6] = 5_000e6;
        d[7] = 10_000e6;
        d[8] = 25_000e6;
        d[9] = 50_000e6;
        d[10] = 10e6;
    }

    function _withdrawDenomInputs(uint256 denominationId, bytes32 nullifier, address recipient)
        internal
        pure
        returns (bytes32[] memory pi)
    {
        pi = new bytes32[](5);
        pi[0] = bytes32(denominationId);
        pi[1] = nullifier;
        pi[2] = bytes32(uint256(10));
        pi[3] = bytes32(0);
        pi[4] = bytes32(uint256(uint160(recipient)));
    }

    function test_SetDenominationsAndAllowlist() public {
        uint256[] memory d = _stablesDenoms();
        poolUsdc.setDenominations(d);
        assertEq(poolUsdc.denominationCount(), 11);
        assertEq(poolUsdc.denominations(10), 10e6);
        assertTrue(poolUsdc.isAllowedDenominationAmount(10e6));
        assertTrue(poolUsdc.isAllowedDenominationAmount(50e6));
        assertFalse(poolUsdc.isAllowedDenominationAmount(11e6));

        vm.prank(alice);
        vm.expectRevert();
        poolUsdc.setDenominations(d);
    }

    function test_WithdrawDenomRequiresVerifierAndTable() public {
        uint256 amount = 50e6;
        depositV.setDepositExpectation(bytes32(amount), COMMIT_A);
        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), amount);
        poolUsdc.deposit(COMMIT_A, amount, hex"00", _depositInputs(amount, COMMIT_A));
        vm.stopPrank();

        bytes32[] memory wpi = _withdrawDenomInputs(0, bytes32(uint256(0xabc)), bob);
        vm.expectRevert(ShieldedPool.DenomVerifierUnset.selector);
        poolUsdc.withdrawDenom(hex"00", wpi);

        MockVerifier denomV = new MockVerifier();
        poolUsdc.setWithdrawDenomVerifier(address(denomV));
        vm.expectRevert(ShieldedPool.BadDenominationId.selector);
        poolUsdc.withdrawDenom(hex"00", wpi);

        poolUsdc.setDenominations(_stablesDenoms());
        poolUsdc.withdrawDenom(hex"00", wpi);
        assertEq(usdc.balanceOf(bob), amount);
        assertEq(usdc.balanceOf(address(poolUsdc)), 0);
    }

    function test_WithdrawDenomBadIdReverts() public {
        uint256 amount = 10e6;
        depositV.setDepositExpectation(bytes32(amount), COMMIT_A);
        MockVerifier denomV = new MockVerifier();
        poolUsdc.setWithdrawDenomVerifier(address(denomV));
        poolUsdc.setDenominations(_stablesDenoms());

        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), amount);
        poolUsdc.deposit(COMMIT_A, amount, hex"00", _depositInputs(amount, COMMIT_A));
        vm.stopPrank();

        bytes32[] memory wpi = _withdrawDenomInputs(99, bytes32(uint256(1)), bob);
        vm.expectRevert(ShieldedPool.BadDenominationId.selector);
        poolUsdc.withdrawDenom(hex"00", wpi);
    }

    function test_WithdrawDenomId10PaysTen() public {
        uint256 amount = 10e6;
        depositV.setDepositExpectation(bytes32(amount), COMMIT_B);
        MockVerifier denomV = new MockVerifier();
        poolUsdc.setWithdrawDenomVerifier(address(denomV));
        poolUsdc.setDenominations(_stablesDenoms());

        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), amount);
        poolUsdc.deposit(COMMIT_B, amount, hex"00", _depositInputs(amount, COMMIT_B));
        vm.stopPrank();

        poolUsdc.withdrawDenom(hex"00", _withdrawDenomInputs(10, bytes32(uint256(0x10)), bob));
        assertEq(usdc.balanceOf(bob), 10e6);
    }

    function test_RouterWithdrawDenom() public {
        uint256 amount = 100e6;
        depositV.setDepositExpectation(bytes32(amount), COMMIT_A);
        MockVerifier denomV = new MockVerifier();
        poolUsdc.setWithdrawDenomVerifier(address(denomV));
        poolUsdc.setDenominations(_stablesDenoms());

        uint256 fee = router.quoteFee(amount);
        vm.startPrank(alice);
        usdc.approve(address(router), amount + fee);
        router.deposit(address(usdc), COMMIT_A, amount, hex"00", _depositInputs(amount, COMMIT_A));
        vm.stopPrank();

        router.withdrawDenom(
            address(usdc), hex"00", _withdrawDenomInputs(1, bytes32(uint256(0x99)), bob), false
        );
        assertEq(usdc.balanceOf(bob), amount);
    }

    function test_WithdrawDenomNullifierReuseReverts() public {
        uint256 amount = 50e6;
        depositV.setDepositExpectation(bytes32(amount), COMMIT_A);
        MockVerifier denomV = new MockVerifier();
        poolUsdc.setWithdrawDenomVerifier(address(denomV));
        poolUsdc.setDenominations(_stablesDenoms());

        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), amount);
        poolUsdc.deposit(COMMIT_A, amount, hex"00", _depositInputs(amount, COMMIT_A));
        vm.stopPrank();

        bytes32 nullifier = bytes32(uint256(0xdead));
        bytes32[] memory wpi = _withdrawDenomInputs(0, nullifier, bob);
        poolUsdc.withdrawDenom(hex"00", wpi);
        vm.expectRevert(ShieldedPool.NullifierUsed.selector);
        poolUsdc.withdrawDenom(hex"00", wpi);
    }

    function test_DepositBatchDirect() public {
        poolUsdc.setDenominations(_stablesDenoms());
        // ids: 10 (10), 0 (50), 1 (100) → total 160
        uint256[] memory ids = new uint256[](3);
        ids[0] = 10;
        ids[1] = 0;
        ids[2] = 1;
        bytes32[] memory commits = new bytes32[](3);
        commits[0] = bytes32(uint256(0xaaa1));
        commits[1] = bytes32(uint256(0xaaa2));
        commits[2] = bytes32(uint256(0xaaa3));
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 10e6;
        amounts[1] = 50e6;
        amounts[2] = 100e6;
        uint256 total = 160e6;

        bytes[] memory proofs = new bytes[](3);
        bytes32[][] memory pis = new bytes32[][](3);
        for (uint256 i = 0; i < 3; i++) {
            proofs[i] = hex"00";
            pis[i] = _depositInputs(amounts[i], commits[i]);
        }

        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), total);
        poolUsdc.depositBatch(commits, ids, proofs, pis);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(poolUsdc)), total);
        assertTrue(poolUsdc.usedCommitments(commits[0]));
        assertTrue(poolUsdc.usedCommitments(commits[1]));
        assertTrue(poolUsdc.usedCommitments(commits[2]));
    }

    function test_DepositBatchValueMismatchReverts() public {
        poolUsdc.setDenominations(_stablesDenoms());
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0; // 50e6
        bytes32[] memory commits = new bytes32[](1);
        commits[0] = COMMIT_A;
        bytes[] memory proofs = new bytes[](1);
        proofs[0] = hex"00";
        bytes32[][] memory pis = new bytes32[][](1);
        pis[0] = _depositInputs(11e6, COMMIT_A); // wrong value

        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), 50e6);
        vm.expectRevert(ShieldedPool.ValueMismatch.selector);
        poolUsdc.depositBatch(commits, ids, proofs, pis);
        vm.stopPrank();
    }

    function test_DepositBatchDuplicateCommitmentReverts() public {
        poolUsdc.setDenominations(_stablesDenoms());
        uint256[] memory ids = new uint256[](2);
        ids[0] = 10;
        ids[1] = 10;
        bytes32[] memory commits = new bytes32[](2);
        commits[0] = COMMIT_A;
        commits[1] = COMMIT_A;
        bytes[] memory proofs = new bytes[](2);
        bytes32[][] memory pis = new bytes32[][](2);
        for (uint256 i = 0; i < 2; i++) {
            proofs[i] = hex"00";
            pis[i] = _depositInputs(10e6, COMMIT_A);
        }

        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), 20e6);
        vm.expectRevert(ShieldedPool.CommitmentUsed.selector);
        poolUsdc.depositBatch(commits, ids, proofs, pis);
        vm.stopPrank();
    }

    function test_DepositBatchDenomsUnsetReverts() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        bytes32[] memory commits = new bytes32[](1);
        commits[0] = COMMIT_A;
        bytes[] memory proofs = new bytes[](1);
        proofs[0] = hex"00";
        bytes32[][] memory pis = new bytes32[][](1);
        pis[0] = _depositInputs(50e6, COMMIT_A);

        vm.startPrank(alice);
        usdc.approve(address(poolUsdc), 50e6);
        vm.expectRevert(ShieldedPool.DenomsUnset.selector);
        poolUsdc.depositBatch(commits, ids, proofs, pis);
        vm.stopPrank();
    }

    function test_RouterDepositBatchTakesFee() public {
        poolUsdc.setDenominations(_stablesDenoms());
        uint256[] memory ids = new uint256[](2);
        ids[0] = 10; // 10
        ids[1] = 1; // 100
        uint256 total = 110e6;
        uint256 fee = router.quoteFee(total);
        assertEq(fee, (110e6 * FEE_BPS) / 10_000);

        bytes32[] memory commits = new bytes32[](2);
        commits[0] = bytes32(uint256(0xb1));
        commits[1] = bytes32(uint256(0xb2));
        bytes[] memory proofs = new bytes[](2);
        bytes32[][] memory pis = new bytes32[][](2);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10e6;
        amounts[1] = 100e6;
        for (uint256 i = 0; i < 2; i++) {
            proofs[i] = hex"00";
            pis[i] = _depositInputs(amounts[i], commits[i]);
        }

        vm.startPrank(alice);
        usdc.approve(address(router), total + fee);
        router.depositBatch(address(usdc), commits, ids, proofs, pis);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(poolUsdc)), total);
        assertEq(usdc.balanceOf(treasury), fee);
        assertTrue(poolUsdc.usedCommitments(commits[0]));
        assertTrue(poolUsdc.usedCommitments(commits[1]));
    }

    function test_RouterDepositBatchNative() public {
        // Configure WETH pool with 18-dec-style denoms for test: id0=0.1e18, id10=10e18 — use simple table
        uint256[] memory d = new uint256[](11);
        d[0] = 0.1 ether;
        d[1] = 0.5 ether;
        d[2] = 1 ether;
        d[3] = 5 ether;
        d[4] = 25 ether;
        d[5] = 50 ether;
        d[6] = 100 ether;
        d[7] = 250 ether;
        d[8] = 500 ether;
        d[9] = 1000 ether;
        d[10] = 10 ether;
        poolWeth.setDenominations(d);

        uint256[] memory ids = new uint256[](2);
        ids[0] = 2; // 1 ether
        ids[1] = 10; // 10 ether
        uint256 total = 11 ether;
        uint256 fee = router.quoteFee(total);

        bytes32[] memory commits = new bytes32[](2);
        commits[0] = bytes32(uint256(0xc1));
        commits[1] = bytes32(uint256(0xc2));
        bytes[] memory proofs = new bytes[](2);
        bytes32[][] memory pis = new bytes32[][](2);
        pis[0] = _depositInputs(1 ether, commits[0]);
        pis[1] = _depositInputs(10 ether, commits[1]);
        proofs[0] = hex"00";
        proofs[1] = hex"00";

        vm.prank(alice);
        router.depositBatchNative{value: total + fee}(commits, ids, proofs, pis);

        assertEq(weth.balanceOf(address(poolWeth)), total);
        assertEq(weth.balanceOf(treasury), fee);
    }
}
