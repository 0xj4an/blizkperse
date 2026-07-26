// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IVerifier} from "../contract/Verifier.sol";

/// @notice Configurable mock verifier for Foundry tests.
contract MockVerifier is IVerifier {
    bool public shouldPass = true;
    bytes32 public expectedValue;
    bytes32 public expectedCommitment;
    bool public checkDepositInputs;

    function setShouldPass(bool v) external {
        shouldPass = v;
    }

    function setDepositExpectation(bytes32 value, bytes32 commitment) external {
        expectedValue = value;
        expectedCommitment = commitment;
        checkDepositInputs = true;
    }

    function clearDepositExpectation() external {
        checkDepositInputs = false;
    }

    function verify(bytes calldata, bytes32[] calldata publicInputs) external view returns (bool) {
        if (!shouldPass) return false;
        if (checkDepositInputs) {
            if (publicInputs.length < 2) return false;
            if (publicInputs[0] != expectedValue) return false;
            if (publicInputs[1] != expectedCommitment) return false;
        }
        return true;
    }
}
