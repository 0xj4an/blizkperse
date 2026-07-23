// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IVerifier} from "./Verifier.sol";

/// @notice Shielded pool for a single ERC-20 token with arbitrary note amounts.
///         Deposit requires a ZK proof binding commitment to `value == amount`.
contract ShieldedPool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IVerifier public immutable verifier;
    /// @notice Withdraw circuit verifier (5 public inputs).
    IVerifier public immutable withdrawVerifier;
    /// @notice Deposit circuit verifier (2 public inputs: value, commitment).
    IVerifier public immutable depositVerifier;

    /// @notice Authorized router that may deposit on behalf of a user.
    address public router;

    mapping(bytes32 => bool) public isKnownRoot;
    mapping(bytes32 => bool) public nullifiers;
    mapping(bytes32 => bool) public usedCommitments;

    event RootRegistered(bytes32 indexed root);
    event Deposit(address indexed depositor, bytes32 indexed commitment, uint256 amount);
    event TransferIntent(bytes32 indexed root, bytes32 indexed nullifier, bytes32 indexed newCommitment);
    event Withdraw(address indexed recipient, bytes32 indexed nullifier, uint256 amount);
    event RouterUpdated(address indexed router);

    constructor(
        address _token,
        address _verifier,
        bytes32 _genesisRoot,
        address _withdrawVerifier,
        address _depositVerifier
    ) Ownable(msg.sender) {
        require(_token != address(0), "token=0");
        require(_depositVerifier != address(0), "depositVerifier=0");
        require(_withdrawVerifier != address(0), "withdrawVerifier=0");
        token = IERC20(_token);
        verifier = IVerifier(_verifier);
        withdrawVerifier = IVerifier(_withdrawVerifier);
        depositVerifier = IVerifier(_depositVerifier);

        isKnownRoot[_genesisRoot] = true;
        emit RootRegistered(_genesisRoot);
    }

    function setRouter(address _router) external onlyOwner {
        router = _router;
        emit RouterUpdated(_router);
    }

    /// @notice Backward-compatible alias (legacy name).
    function usdc() external view returns (IERC20) {
        return token;
    }

    function registerRoot(bytes32 root) external {
        require(!isKnownRoot[root], "root already known");
        isKnownRoot[root] = true;
        emit RootRegistered(root);
    }

    /// @notice Deposit `amount` of `token` with a proof that commitment binds to that amount.
    /// Public inputs (deposit circuit): [value, commitment].
    function deposit(
        bytes32 commitment,
        uint256 amount,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external nonReentrant {
        _deposit(msg.sender, msg.sender, commitment, amount, proof, publicInputs);
    }

    /// @notice Router-only deposit on behalf of `depositor`. Pulls tokens from `depositor`
    ///         (depositor must have approved this pool) or accepts pre-funded balance from router.
    function depositFor(
        address depositor,
        bytes32 commitment,
        uint256 amount,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external nonReentrant {
        require(msg.sender == router, "only router");
        require(depositor != address(0), "depositor=0");
        _deposit(depositor, depositor, commitment, amount, proof, publicInputs);
    }

    /// @notice Router deposits after pulling tokens to this pool itself (msg.sender == router funded the pool).
    function depositFromRouter(
        address depositor,
        bytes32 commitment,
        uint256 amount,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external nonReentrant {
        require(msg.sender == router, "only router");
        require(depositor != address(0), "depositor=0");
        _deposit(depositor, address(0), commitment, amount, proof, publicInputs);
    }

    function _deposit(
        address depositor,
        address pullFrom,
        bytes32 commitment,
        uint256 amount,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) internal {
        require(amount > 0, "amount=0");
        require(!usedCommitments[commitment], "commitment already used");
        require(publicInputs.length == 2, "wrong number of public inputs");
        require(publicInputs[0] == bytes32(amount), "value != amount");
        require(publicInputs[1] == commitment, "commitment mismatch");
        require(depositVerifier.verify(proof, publicInputs), "invalid deposit proof");

        if (pullFrom != address(0)) {
            token.safeTransferFrom(pullFrom, address(this), amount);
        }
        // else: tokens already sitting on this contract (router pre-funded)

        usedCommitments[commitment] = true;
        emit Deposit(depositor, commitment, amount);
    }

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
        nullifiers[nullifierIn] = true;
        emit TransferIntent(expectedRoot, nullifierIn, newCommitment);
    }

    /// @notice Withdraw arbitrary amount to the recipient in the proof.
    /// Public inputs: [value, nullifier, merkle_proof_length, expected_merkle_root, recipient].
    function withdraw(bytes calldata proof, bytes32[] calldata publicInputs) external nonReentrant {
        require(publicInputs.length == 5, "wrong number of public inputs");

        uint256 amount = uint256(publicInputs[0]);
        bytes32 nullifierIn = publicInputs[1];
        bytes32 expectedRoot = publicInputs[3];
        bytes32 recipientField = publicInputs[4];

        require(amount > 0, "amount=0");
        require(isKnownRoot[expectedRoot], "unknown root");
        require(!nullifiers[nullifierIn], "nullifier used");
        require(withdrawVerifier.verify(proof, publicInputs), "invalid proof");

        nullifiers[nullifierIn] = true;
        address recipient = address(uint160(uint256(recipientField) & type(uint160).max));
        require(recipient != address(0), "recipient=0");
        token.safeTransfer(recipient, amount);

        emit Withdraw(recipient, nullifierIn, amount);
    }
}
