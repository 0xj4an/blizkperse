// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Deploy: source .env && forge script script/Deploy.s.sol:DeployPool --rpc-url "$MONAD_RPC" --broadcast
// Si el RPC no es archive y falla el fork: usa --fork-block-number <bloque_un_poco_antiguo>
//   ej: --fork-block-number 56073600
// O usa un RPC archive de Monad si está disponible.

import "forge-std/Script.sol";

import "../contract/Verifier.sol";      // HonkVerifier + IVerifier
import "../contract/ShieldedPool.sol";  // pool MVP

contract DeployPool is Script {
    function run() external returns (address verifierAddr, address poolAddr) {
        // Requiere en el entorno: PRIVATE_KEY, USDC_ADDRESS
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast(pk);

        HonkVerifier verifier = new HonkVerifier();
        bytes32 genesisRoot = bytes32(0);
        // WithdrawVerifier no se puede importar junto con Verifier.sol (simbolos duplicados).
        // Para pool con withdraw: despliega WithdrawVerifier en otro paso y pasa su address aqui.
        address withdrawVerifierAddr = address(0);
        ShieldedPool pool = new ShieldedPool(usdc, address(verifier), genesisRoot, withdrawVerifierAddr);

        vm.stopBroadcast();

        return (address(verifier), address(pool));
    }
}
