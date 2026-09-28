// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Replace an existing ShieldedPool on a PoolRouter with a new bytecode build
// (Private buckets: setDenominations + depositBatch). Old pool notes stay on the
// old contract and are NOT migrated.
//
//   source .env
//   export POOL_ROUTER_ADDRESS=0x...
//   export TOKEN_ADDRESS=0x...          # ERC-20 already registered on router
//   export DENOM_KIND=stables6         # stables6 | stables18 | native18 | copm18
//   # reuse verifiers from the previous deploy:
//   export DEPOSIT_VERIFIER_ADDRESS=0x...
//   export HONK_VERIFIER_ADDRESS=0x...
//   export WITHDRAW_VERIFIER_ADDRESS=0x...
//   export ROOT_REGISTRAR_ADDRESS=0x... # optional
//   # optional: WITHDRAW_DENOM_VERIFIER_ADDRESS after bb.js deploy
//   forge script script/ReplacePool.s.sol:ReplacePool --rpc-url "$RPC" --broadcast
//
// Then update NEXT_PUBLIC_*_POOL_*_ADDRESS in web/.env to the logged pool address.

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../contract/ShieldedPool.sol";
import "../contract/PoolRouter.sol";

contract ReplacePool is Script {
    function run() external returns (address poolAddr) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address router = vm.envAddress("POOL_ROUTER_ADDRESS");
        address token = vm.envAddress("TOKEN_ADDRESS");
        address depositVerifier = vm.envAddress("DEPOSIT_VERIFIER_ADDRESS");
        address transferVerifier = vm.envAddress("HONK_VERIFIER_ADDRESS");
        address withdrawVerifier = vm.envAddress("WITHDRAW_VERIFIER_ADDRESS");
        address rootRegistrar = vm.envOr("ROOT_REGISTRAR_ADDRESS", address(0));
        address withdrawDenomVerifier = vm.envOr("WITHDRAW_DENOM_VERIFIER_ADDRESS", address(0));
        string memory kind = vm.envString("DENOM_KIND");

        require(router != address(0), "POOL_ROUTER_ADDRESS=0");
        require(token != address(0), "TOKEN_ADDRESS=0");
        require(depositVerifier != address(0), "DEPOSIT_VERIFIER_ADDRESS=0");
        require(transferVerifier != address(0), "HONK_VERIFIER_ADDRESS=0");
        require(withdrawVerifier != address(0), "WITHDRAW_VERIFIER_ADDRESS=0");
        require(bytes(kind).length > 0, "DENOM_KIND required");

        address prev = PoolRouter(payable(router)).poolOf(token);
        require(prev != address(0), "token not listed - use AddPool");

        vm.startBroadcast(pk);

        ShieldedPool pool = new ShieldedPool(
            token,
            transferVerifier,
            bytes32(0),
            withdrawVerifier,
            depositVerifier
        );
        pool.setRouter(router);
        if (rootRegistrar != address(0)) {
            pool.setRootRegistrar(rootRegistrar);
        }
        if (withdrawDenomVerifier != address(0)) {
            pool.setWithdrawDenomVerifier(withdrawDenomVerifier);
        }
        pool.setDenominations(_amountsForKind(kind));
        PoolRouter(payable(router)).setPool(token, address(pool));

        // Optional: gate Private batch deposits to ALLOWLIST_DEPOSITOR (payer EOA).
        address allowDepositor = vm.envOr("ALLOWLIST_DEPOSITOR", address(0));
        if (allowDepositor != address(0)) {
            pool.setPrivateDepositAllowed(allowDepositor, true);
            pool.setPrivateDepositAllowlistEnabled(true);
            console2.log("privateAllowlistDepositor", allowDepositor);
        }

        vm.stopBroadcast();

        poolAddr = address(pool);
        console2.log("chainId", block.chainid);
        console2.log("token", token);
        console2.log("previousPool", prev);
        console2.log("pool", poolAddr);
        console2.log("router", router);
        console2.log("denomKind", kind);
        console2.log("denominationCount", pool.denominationCount());
    }

    function _amountsForKind(string memory kind) internal pure returns (uint256[] memory d) {
        bytes32 k = keccak256(bytes(kind));
        if (k == keccak256("stables6")) {
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
            return d;
        }
        if (k == keccak256("stables18")) {
            d = new uint256[](11);
            d[0] = 50 ether;
            d[1] = 100 ether;
            d[2] = 250 ether;
            d[3] = 500 ether;
            d[4] = 1_000 ether;
            d[5] = 2_500 ether;
            d[6] = 5_000 ether;
            d[7] = 10_000 ether;
            d[8] = 25_000 ether;
            d[9] = 50_000 ether;
            d[10] = 10 ether;
            return d;
        }
        if (k == keccak256("native18")) {
            d = new uint256[](11);
            d[0] = 0.1 ether;
            d[1] = 0.5 ether;
            d[2] = 1 ether;
            d[3] = 5 ether;
            d[4] = 25 ether;
            d[5] = 50 ether;
            d[6] = 100 ether;
            d[7] = 250 ether;
            d[8] = 500 ether;
            d[9] = 1_000 ether;
            d[10] = 10 ether;
            return d;
        }
        if (k == keccak256("copm18")) {
            d = new uint256[](10);
            d[0] = 10_000 ether;
            d[1] = 25_000 ether;
            d[2] = 50_000 ether;
            d[3] = 100_000 ether;
            d[4] = 250_000 ether;
            d[5] = 500_000 ether;
            d[6] = 1_000_000 ether;
            d[7] = 2_500_000 ether;
            d[8] = 5_000_000 ether;
            d[9] = 10_000_000 ether;
            return d;
        }
        revert(string.concat("unknown DENOM_KIND: ", kind));
    }
}
