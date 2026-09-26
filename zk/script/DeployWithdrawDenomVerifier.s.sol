// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Deploy withdraw-denom verifier alone (cannot share a compilation unit with
// DepositVerifier / WithdrawVerifier / Verifier — bb-generated files redefine Fr/Honk).
// Arc EIP-170: use FOUNDRY_PROFILE=eip170 (optimizer_runs=1).
//
//   FOUNDRY_PROFILE=eip170 forge script script/DeployWithdrawDenomVerifier.s.sol:DeployWithdrawDenomVerifier \
//     --rpc-url "$RPC_URL" --broadcast

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../contract/WithdrawDenomVerifier.sol";

contract DeployWithdrawDenomVerifier is Script {
    function run() external returns (address) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        // Contract name inside WithdrawDenomVerifier.sol is HonkVerifier.
        HonkVerifier withdrawDenomVerifier = new HonkVerifier();
        vm.stopBroadcast();
        console2.log("WithdrawDenomVerifier", address(withdrawDenomVerifier));
        return address(withdrawDenomVerifier);
    }
}
