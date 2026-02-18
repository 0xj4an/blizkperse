// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../contract/Starter.sol";

contract VerifyScript is Script {
    Starter public starter;

    function run() public returns (bool) {
        // Starter internally knows the verifier type (HonkVerifier / IVerifier),
        // and you’ll pass the verifier instance in its constructor.
        // If your Starter constructor expects HonkVerifier, it will compile
        // because Starter.sol imports Verifier.sol.

        // Deploy verifier + wrapper
        // NOTE: HonkVerifier symbol must come from Starter.sol importing Verifier.sol.
        HonkVerifier verifier = new HonkVerifier();
        starter = new Starter(verifier);

        // Proof: single-line hex string, must start with 0x
        string memory proofHex = vm.readLine("./circuits/proofs/with_foundry.proof");
        bytes memory proofBytes = vm.parseBytes(proofHex);

        // Public inputs: raw binary (N * 32 bytes)
        bytes memory pi = vm.readFileBinary("./circuits/proofs/public_inputs");
        require(pi.length % 32 == 0, "bad public_inputs");

        uint256 n = pi.length / 32;
        bytes32[] memory publicInputs = new bytes32[](n);

        for (uint256 i = 0; i < n; i++) {
            bytes32 word;
            assembly {
                word := mload(add(add(pi, 0x20), mul(i, 0x20)))
            }
            publicInputs[i] = word;
        }

        console2.log("publicInputs words:", n);

        bool ok = starter.verifyPay(proofBytes, publicInputs);
        console2.log("Verification result:", ok);
        return ok;
    }
}
