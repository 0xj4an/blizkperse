// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Deploy one ShieldedPool and register it on an existing PoolRouter (owner = PRIVATE_KEY).
//
//   source .env
//   forge script script/AddPool.s.sol:AddPool --rpc-url "$CELO_RPC" --broadcast
//
// Env:
//   PRIVATE_KEY                 (router + new pool owner)
//   POOL_ROUTER_ADDRESS         (existing router)
//   TOKEN_ADDRESS               (ERC-20 to list, e.g. Celo USDC)
//   DEPOSIT_VERIFIER_ADDRESS
//   HONK_VERIFIER_ADDRESS       (transfer verifier)
//   WITHDRAW_VERIFIER_ADDRESS
//   ROOT_REGISTRAR_ADDRESS      (optional; zero skips setRootRegistrar)

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../contract/ShieldedPool.sol";
import "../contract/PoolRouter.sol";

contract AddPool is Script {
    function run() external returns (address poolAddr) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address router = vm.envAddress("POOL_ROUTER_ADDRESS");
        address token = vm.envAddress("TOKEN_ADDRESS");
        address depositVerifier = vm.envAddress("DEPOSIT_VERIFIER_ADDRESS");
        address transferVerifier = vm.envAddress("HONK_VERIFIER_ADDRESS");
        address withdrawVerifier = vm.envAddress("WITHDRAW_VERIFIER_ADDRESS");
        address rootRegistrar = vm.envOr("ROOT_REGISTRAR_ADDRESS", address(0));

        require(router != address(0), "POOL_ROUTER_ADDRESS=0");
        require(token != address(0), "TOKEN_ADDRESS=0");
        require(depositVerifier != address(0), "DEPOSIT_VERIFIER_ADDRESS=0");
        require(transferVerifier != address(0), "HONK_VERIFIER_ADDRESS=0");
        require(withdrawVerifier != address(0), "WITHDRAW_VERIFIER_ADDRESS=0");
        require(PoolRouter(payable(router)).poolOf(token) == address(0), "token already listed");

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
        PoolRouter(payable(router)).setPool(token, address(pool));

        vm.stopBroadcast();

        poolAddr = address(pool);
        console2.log("chainId", block.chainid);
        console2.log("token", token);
        console2.log("pool", poolAddr);
        console2.log("router", router);
        console2.log("rootRegistrar", rootRegistrar);
    }
}
