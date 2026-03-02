// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Verifier.sol";

contract Starter {
    IVerifier public verifier;

    constructor(IVerifier _verifier) {
        verifier = _verifier;
    }

    function verifyPay(bytes calldata proof, bytes32[] calldata publicInputs)
        external
        view
        returns (bool)
    {
        bool ok = verifier.verify(proof, publicInputs);
        require(ok, "Proof is not valid");
        return ok;
    }
}
