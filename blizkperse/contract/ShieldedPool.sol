// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVerifier} from "./Verifier.sol";

contract ShieldedPool is ReentrancyGuard {
    // 1 USDC (6 decimals)
    uint256 public constant DENOMINATION = 1e6;

    IERC20 public immutable usdc;
    IVerifier public immutable verifier;
    /// @notice Withdraw circuit verifier (5 public inputs). If address(0), withdraw is disabled.
    IVerifier public immutable withdrawVerifier;

    // root registry (MVP): allow roots computed offchain
    mapping(bytes32 => bool) public isKnownRoot;

    // spent nullifiers
    mapping(bytes32 => bool) public nullifiers;

    // each commitment can only be deposited once (one note = one commitment)
    mapping(bytes32 => bool) public usedCommitments;

    event RootRegistered(bytes32 indexed root);
    event Deposit(address indexed sender, bytes32 indexed commitment);
    event TransferIntent(bytes32 indexed root, bytes32 indexed nullifier, bytes32 indexed newCommitment);
    event Withdraw(address indexed recipient, bytes32 indexed nullifier);

    constructor(address _usdc, address _verifier, bytes32 _genesisRoot, address _withdrawVerifier) {
        usdc = IERC20(_usdc);
        verifier = IVerifier(_verifier);
        withdrawVerifier = IVerifier(_withdrawVerifier);

        // genesis root (for empty tree / initial state you use offchain)
        isKnownRoot[_genesisRoot] = true;
        emit RootRegistered(_genesisRoot);
    }

    /// @notice MVP: adminless root registration.
    /// Anyone can register a root; it doesn't move funds by itself.
    /// For production you'd restrict this or derive roots onchain.
    function registerRoot(bytes32 root) external {
        require(!isKnownRoot[root], "root already known");
        isKnownRoot[root] = true;
        emit RootRegistered(root);
    }

    /// @notice Deposit exactly 1 USDC to mint a note commitment (commitment computed offchain)
    /// Each commitment can only be used once (ensures one note per commitment).
    function deposit(bytes32 commitment) external nonReentrant {
        require(!usedCommitments[commitment], "commitment already used");
        require(usdc.transferFrom(msg.sender, address(this), DENOMINATION), "transferFrom failed");
        usedCommitments[commitment] = true;
        emit Deposit(msg.sender, commitment);
    }

    /// @notice Private note -> note transfer (no token moves; state is enforced by nullifiers + commitments offchain)
    /// publicInputs order MUST match Noir circuit:
    /// [0]=new_commitment, [1]=nullifier_in, [2]=merkle_proof_length, [3]=expected_merkle_root
    function transferIntent(
        bytes32 expectedRoot,
        bytes32 nullifierIn,
        uint32 merkleProofLength,
        bytes32 newCommitment,
        bytes calldata proof
    ) external nonReentrant {
        require(isKnownRoot[expectedRoot], "unknown root");
        require(!nullifiers[nullifierIn], "nullifier used");

        bytes32[] memory publicInputs = new bytes32[](4);
        publicInputs[0] = newCommitment;
        publicInputs[1] = nullifierIn;
        publicInputs[2] = bytes32(uint256(merkleProofLength));
        publicInputs[3] = expectedRoot;

        require(verifier.verify(proof, publicInputs), "invalid proof");

        // effects
        nullifiers[nullifierIn] = true;

        emit TransferIntent(expectedRoot, nullifierIn, newCommitment);
    }

    /// @notice Withdraw 1 USDC to the recipient proved in the circuit.
    /// Public inputs (withdraw circuit order): [value, nullifier, merkle_proof_length, expected_merkle_root, recipient].
    /// recipient is the address as Field (32 bytes, address in lower 20 bytes). Requires withdrawVerifier != address(0).
    function withdraw(bytes calldata proof, bytes32[] calldata publicInputs) external nonReentrant {
        require(address(withdrawVerifier) != address(0), "withdraw not enabled");
        require(publicInputs.length == 5, "wrong number of public inputs");

        bytes32 valueField = publicInputs[0];
        bytes32 nullifierIn = publicInputs[1];
        bytes32 expectedRoot = publicInputs[3];
        bytes32 recipientField = publicInputs[4];

        require(valueField == bytes32(uint256(1)), "only 1 USDC per note");
        require(isKnownRoot[expectedRoot], "unknown root");
        require(!nullifiers[nullifierIn], "nullifier used");

        require(withdrawVerifier.verify(proof, publicInputs), "invalid proof");

        nullifiers[nullifierIn] = true;
        address recipient = address(uint160(uint256(recipientField)));
        require(usdc.transfer(recipient, DENOMINATION), "transfer failed");

        emit Withdraw(recipient, nullifierIn);
    }
}
