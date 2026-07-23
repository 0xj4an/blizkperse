// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Deploy deposit verifier alone (cannot share a compilation unit with WithdrawVerifier —
// both bb-generated files redefine Fr/Honk/ZKTranscriptLib).
//   forge script script/DeployDepositVerifier.s.sol:DeployDepositVerifier --rpc-url "$RPC_URL" --broadcast

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../contract/DepositVerifier.sol";

contract DeployDepositVerifier is Script {
    function run() external returns (address) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        DepositHonkVerifier depositVerifier = new DepositHonkVerifier();
        vm.stopBroadcast();
        console2.log("DepositVerifier", address(depositVerifier));
        return address(depositVerifier);
    }
}
