// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Deploy: desde zk/ con .env cargado:
//   source .env && forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast
// Requiere: PRIVATE_KEY, USDC_ADDRESS, MONAD_RPC en .env
// Si el RPC no es archive: --fork-block-number <bloque_reciente>

import "forge-std/Script.sol";

import "../contract/Verifier.sol";           // HonkVerifier (transfer intent)
import "../contract/WithdrawVerifier.sol";    // WithdrawVerifier (circuito withdraw)
import "../contract/ShieldedPool.sol";

contract DeployPool is Script {
    function run() external returns (address verifierAddr, address poolAddr) {
        // Requiere en el entorno: PRIVATE_KEY, USDC_ADDRESS
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast(pk);

        HonkVerifier verifier = new HonkVerifier();
        WithdrawVerifier withdrawVerifier = new WithdrawVerifier();
        bytes32 genesisRoot = bytes32(0);
        ShieldedPool pool = new ShieldedPool(usdc, address(verifier), genesisRoot, address(withdrawVerifier));

        vm.stopBroadcast();

        return (address(verifier), address(pool));
    }
}
