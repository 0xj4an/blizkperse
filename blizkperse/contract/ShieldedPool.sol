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

    // root registry (MVP): allow roots computed offchain
    mapping(bytes32 => bool) public isKnownRoot;

    // spent nullifiers
    mapping(bytes32 => bool) public nullifiers;

    event RootRegistered(bytes32 indexed root);
    event Deposit(address indexed sender, bytes32 indexed commitment);
    event TransferIntent(bytes32 indexed root, bytes32 indexed nullifier, bytes32 indexed newCommitment);
    event Withdraw(address indexed recipient, bytes32 indexed nullifier);

    constructor(address _usdc, address _verifier, bytes32 _genesisRoot) {
        usdc = IERC20(_usdc);
        verifier = IVerifier(_verifier);

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
    function deposit(bytes32 commitment) external nonReentrant {
        require(usdc.transferFrom(msg.sender, address(this), DENOMINATION), "transferFrom failed");
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

        bytes32[] memory publicInputs;
        publicInputs[0] = newCommitment;
        publicInputs[1] = nullifierIn;
        publicInputs[2] = bytes32(uint256(merkleProofLength));
        publicInputs[3] = expectedRoot;

        require(verifier.verify(proof, publicInputs), "invalid proof");

        // effects
        nullifiers[nullifierIn] = true;

        emit TransferIntent(expectedRoot, nullifierIn, newCommitment);
    }

    /// @notice Withdraw 1 USDC to msg.sender. Requires a proof that burns one note (no new note).
    /// Public inputs: [burnCommitment=0, nullifierIn, merkleProofLength, expectedRoot].
    /// To support this you need a "withdraw" circuit that outputs new_commitment = 0 (burn).
    bytes32 public constant BURN_COMMITMENT = bytes32(0);

    function withdraw(
        bytes32 expectedRoot,
        bytes32 nullifierIn,
        uint32 merkleProofLength,
        bytes calldata proof
    ) external nonReentrant {
        require(isKnownRoot[expectedRoot], "unknown root");
        require(!nullifiers[nullifierIn], "nullifier used");

        bytes32[] memory publicInputs = new bytes32[](4);
        publicInputs[0] = BURN_COMMITMENT;
        publicInputs[1] = nullifierIn;
        publicInputs[2] = bytes32(uint256(merkleProofLength));
        publicInputs[3] = expectedRoot;

        require(verifier.verify(proof, publicInputs), "invalid proof");

        nullifiers[nullifierIn] = true;
        require(usdc.transfer(msg.sender, DENOMINATION), "transfer failed");

        emit Withdraw(msg.sender, nullifierIn);
    }
}
