// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Deploy: desde zk/ con .env cargado:
//   source .env && forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast
// Requiere: PRIVATE_KEY, USDC_ADDRESS, MONAD_RPC en .env
// Si el RPC no es archive: --fork-block-number <bloque_reciente>

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../contract/Verifier.sol";           // HonkVerifier (transfer intent)
import "../contract/WithdrawVerifier.sol";    // WithdrawVerifier (circuito withdraw)
import "../contract/ShieldedPool.sol";

contract DeployPool is Script {
    function run() external returns (address verifierAddr, address withdrawVerifierAddr, address poolAddr) {
        // Requiere en el entorno: PRIVATE_KEY, USDC_ADDRESS
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast(pk);

        HonkVerifier verifier = new HonkVerifier();
        WithdrawHonkVerifier withdrawVerifier = new WithdrawHonkVerifier();
        bytes32 genesisRoot = bytes32(0);
        ShieldedPool pool = new ShieldedPool(usdc, address(verifier), genesisRoot, address(withdrawVerifier));

        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("stablecoin", usdc);
        console2.log("HonkVerifier", address(verifier));
        console2.log("WithdrawVerifier", address(withdrawVerifier));
        console2.log("ShieldedPool", address(pool));

        return (address(verifier), address(withdrawVerifier), address(pool));
    }
}
