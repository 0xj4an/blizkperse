// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IVerifier} from "./Verifier.sol";

/// @notice Shielded pool for a single ERC-20 token with arbitrary note amounts.
///         Deposit requires a ZK proof binding commitment to `value == amount`.
///         Optional Private-buckets mode: denomination allowlist + withdrawDenom verifier.
contract ShieldedPool is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error BadDenomLength();
    error BadBatchLength();
    error LengthMismatch();
    error DenomsUnset();
    error BadDenominationId();
    error CommitmentUsed();
    error CommitmentZero();
    error WrongPublicInputs();
    error ValueMismatch();
    error CommitmentMismatch();
    error InvalidProof();
    error OnlyRouter();
    error OnlyRegistrar();
    error RootKnown();
    error UnknownRoot();
    error NullifierUsed();
    error DenomVerifierUnset();
    error RecipientZero();
    error PrivateDepositNotAllowed();

    uint256 public constant MAX_DENOMINATIONS = 64;
    uint256 public constant MAX_BATCH_NOTES = 64;

    IERC20 public immutable token;
    IVerifier public immutable verifier;
    /// @notice Withdraw circuit verifier (5 public inputs: value, …) — Standard / arbitrary.
    IVerifier public immutable withdrawVerifier;
    /// @notice Deposit circuit verifier (2 public inputs: value, commitment).
    IVerifier public immutable depositVerifier;
    /// @notice Denomination withdraw verifier (5 public inputs: denomination_id, …). Zero until set.
    IVerifier public withdrawDenomVerifier;

    /// @notice Authorized router that may deposit on behalf of a user.
    address public router;
    /// @notice Only this address may call `registerRoot` (backend indexer). Zero disables new roots until set.
    address public rootRegistrar;

    /// @notice Fixed note amounts for Private mode (index = denomination_id). Empty = unset.
    uint256[] private _denominations;

    /// @notice When true, only `privateDepositAllowed` addresses may call Private batch paths.
    bool public privateDepositAllowlistEnabled;
    mapping(address => bool) public privateDepositAllowed;

    mapping(bytes32 => bool) public isKnownRoot;
    mapping(bytes32 => bool) public nullifiers;
    mapping(bytes32 => bool) public usedCommitments;

    event RootRegistered(bytes32 indexed root);
    event Deposit(address indexed depositor, bytes32 indexed commitment, uint256 amount);
    event BatchDeposit(address indexed depositor, uint256 totalAmount, uint256 count);
    event CommitmentInserted(bytes32 indexed commitment, uint256 indexed denominationId);
    event TransferIntent(bytes32 indexed root, bytes32 indexed nullifier, bytes32 indexed newCommitment);
    event Withdraw(address indexed recipient, bytes32 indexed nullifier, uint256 amount);
    event WithdrawDenom(
        address indexed recipient, bytes32 indexed nullifier, uint256 indexed denominationId, uint256 amount
    );
    event RouterUpdated(address indexed router);
    event RootRegistrarUpdated(address indexed registrar);
    event WithdrawDenomVerifierUpdated(address indexed verifier);
    event DenominationsUpdated(uint256 count);
    event PrivateDepositAllowlistEnabled(bool enabled);
    event PrivateDepositAllowedUpdated(address indexed account, bool allowed);

    constructor(
        address _token,
        address _verifier,
        bytes32 _genesisRoot,
        address _withdrawVerifier,
        address _depositVerifier
    ) Ownable(msg.sender) {
        if (_token == address(0)) revert ZeroAddress();
        if (_depositVerifier == address(0)) revert ZeroAddress();
        if (_withdrawVerifier == address(0)) revert ZeroAddress();
        token = IERC20(_token);
        verifier = IVerifier(_verifier);
        withdrawVerifier = IVerifier(_withdrawVerifier);
        depositVerifier = IVerifier(_depositVerifier);

        isKnownRoot[_genesisRoot] = true;
        emit RootRegistered(_genesisRoot);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setRouter(address _router) external onlyOwner {
        router = _router;
        emit RouterUpdated(_router);
    }

    function setRootRegistrar(address _registrar) external onlyOwner {
        rootRegistrar = _registrar;
        emit RootRegistrarUpdated(_registrar);
    }

    function setWithdrawDenomVerifier(address _verifier) external onlyOwner {
        withdrawDenomVerifier = IVerifier(_verifier);
        emit WithdrawDenomVerifierUpdated(_verifier);
    }

    function setPrivateDepositAllowlistEnabled(bool enabled) external onlyOwner {
        privateDepositAllowlistEnabled = enabled;
        emit PrivateDepositAllowlistEnabled(enabled);
    }

    function setPrivateDepositAllowed(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        privateDepositAllowed[account] = allowed;
        emit PrivateDepositAllowedUpdated(account, allowed);
    }

    /// @notice Replace the Private-mode denomination table (amount at index `id`).
    /// @dev Stables example: ids 0..9 = 50..50_000 * 1e6, id 10 = 10 * 1e6. Must match circuit + packer.
    function setDenominations(uint256[] calldata amounts) external onlyOwner {
        uint256 n = amounts.length;
        if (n == 0 || n > MAX_DENOMINATIONS) revert BadDenomLength();
        delete _denominations;
        for (uint256 i = 0; i < n; i++) {
            if (amounts[i] == 0) revert ZeroAmount();
            _denominations.push(amounts[i]);
        }
        emit DenominationsUpdated(n);
    }

    function denominationCount() external view returns (uint256) {
        return _denominations.length;
    }

    function denominations(uint256 id) external view returns (uint256) {
        if (id >= _denominations.length) revert BadDenominationId();
        return _denominations[id];
    }

    function getDenominations() external view returns (uint256[] memory) {
        return _denominations;
    }

    /// @notice Sum of allowlisted amounts for `denominationIds` (one external call for the router).
    function quoteBatch(uint256[] calldata denominationIds) external view returns (uint256 total) {
        uint256 n = denominationIds.length;
        if (n == 0 || n > MAX_BATCH_NOTES) revert BadBatchLength();
        uint256 len = _denominations.length;
        if (len == 0) revert DenomsUnset();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = denominationIds[i];
            if (id >= len) revert BadDenominationId();
            total += _denominations[id];
        }
        if (total == 0) revert ZeroAmount();
    }

    /// @notice Whether `amount` appears in the Private allowlist (for depositBatch / packer checks).
    function isAllowedDenominationAmount(uint256 amount) external view returns (bool) {
        uint256 n = _denominations.length;
        for (uint256 i = 0; i < n; i++) {
            if (_denominations[i] == amount) return true;
        }
        return false;
    }

    /// @notice Backward-compatible alias (legacy name).
    function usdc() external view returns (IERC20) {
        return token;
    }

    /// @notice Whitelist a Merkle root. Only `rootRegistrar` (backend) may call this.
    function registerRoot(bytes32 root) external {
        if (msg.sender != rootRegistrar) revert OnlyRegistrar();
        if (isKnownRoot[root]) revert RootKnown();
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
    ) external nonReentrant whenNotPaused {
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
    ) external nonReentrant whenNotPaused {
        if (msg.sender != router) revert OnlyRouter();
        if (depositor == address(0)) revert ZeroAddress();
        _deposit(depositor, depositor, commitment, amount, proof, publicInputs);
    }

    /// @notice Router deposits after tokens were already sent to this pool (msg.sender == router).
    function depositFromRouter(
        address depositor,
        bytes32 commitment,
        uint256 amount,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external nonReentrant whenNotPaused {
        if (msg.sender != router) revert OnlyRouter();
        if (depositor == address(0)) revert ZeroAddress();
        _deposit(depositor, address(0), commitment, amount, proof, publicInputs);
    }

    /// @notice Private-mode batch: N denomination notes in one call. Pulls `Σ denominations[id]` from caller.
    /// Emits `BatchDeposit` + `CommitmentInserted` (no per-note amounts). Requires denominations set.
    function depositBatch(
        bytes32[] calldata commitments,
        uint256[] calldata denominationIds,
        bytes[] calldata proofs,
        bytes32[][] calldata publicInputs
    ) external nonReentrant whenNotPaused {
        _requirePrivateDepositor(msg.sender);
        uint256 total = _processDenomBatch(msg.sender, commitments, denominationIds, proofs, publicInputs, true);
        emit BatchDeposit(msg.sender, total, commitments.length);
    }

    /// @notice Router-funded Private batch. Caller must have already transferred `Σ` note amounts to this pool.
    function depositBatchFromRouter(
        address depositor,
        bytes32[] calldata commitments,
        uint256[] calldata denominationIds,
        bytes[] calldata proofs,
        bytes32[][] calldata publicInputs
    ) external nonReentrant whenNotPaused {
        if (msg.sender != router) revert OnlyRouter();
        if (depositor == address(0)) revert ZeroAddress();
        _requirePrivateDepositor(depositor);
        uint256 total = _processDenomBatch(depositor, commitments, denominationIds, proofs, publicInputs, false);
        emit BatchDeposit(depositor, total, commitments.length);
    }

    function _requirePrivateDepositor(address account) internal view {
        if (privateDepositAllowlistEnabled && !privateDepositAllowed[account]) {
            revert PrivateDepositNotAllowed();
        }
    }

    /// @dev Single pass: verify proof, bind denomination, mark commitment (duplicates hit CommitmentUsed).
    function _processDenomBatch(
        address depositor,
        bytes32[] calldata commitments,
        uint256[] calldata denominationIds,
        bytes[] calldata proofs,
        bytes32[][] calldata publicInputs,
        bool pullFromCaller
    ) internal returns (uint256 total) {
        uint256 n = commitments.length;
        if (n == 0 || n > MAX_BATCH_NOTES) revert BadBatchLength();
        if (denominationIds.length != n || proofs.length != n || publicInputs.length != n) {
            revert LengthMismatch();
        }
        uint256 denomLen = _denominations.length;
        if (denomLen == 0) revert DenomsUnset();

        for (uint256 i = 0; i < n; i++) {
            uint256 id = denominationIds[i];
            if (id >= denomLen) revert BadDenominationId();
            total += _denominations[id];
        }
        if (total == 0) revert ZeroAmount();

        if (pullFromCaller) {
            token.safeTransferFrom(depositor, address(this), total);
        }

        for (uint256 i = 0; i < n; i++) {
            bytes32 commitment = commitments[i];
            if (commitment == bytes32(0)) revert CommitmentZero();
            if (usedCommitments[commitment]) revert CommitmentUsed();

            uint256 amount = _denominations[denominationIds[i]];
            bytes32[] calldata pi = publicInputs[i];
            if (pi.length != 2) revert WrongPublicInputs();
            if (uint256(pi[0]) != amount) revert ValueMismatch();
            if (pi[1] != commitment) revert CommitmentMismatch();
            if (!depositVerifier.verify(proofs[i], pi)) revert InvalidProof();

            usedCommitments[commitment] = true;
            emit CommitmentInserted(commitment, denominationIds[i]);
        }
    }

    function _deposit(
        address depositor,
        address pullFrom,
        bytes32 commitment,
        uint256 amount,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) internal {
        if (amount == 0) revert ZeroAmount();
        if (usedCommitments[commitment]) revert CommitmentUsed();
        if (publicInputs.length != 2) revert WrongPublicInputs();
        if (publicInputs[0] != bytes32(amount)) revert ValueMismatch();
        if (publicInputs[1] != commitment) revert CommitmentMismatch();
        if (!depositVerifier.verify(proof, publicInputs)) revert InvalidProof();

        if (pullFrom != address(0)) {
            token.safeTransferFrom(pullFrom, address(this), amount);
        }

        usedCommitments[commitment] = true;
        emit Deposit(depositor, commitment, amount);
    }

    function transferIntent(
        bytes32 expectedRoot,
        bytes32 nullifierIn,
        uint32 merkleProofLength,
        bytes32 newCommitment,
        bytes calldata proof
    ) external nonReentrant whenNotPaused {
        if (!isKnownRoot[expectedRoot]) revert UnknownRoot();
        if (nullifiers[nullifierIn]) revert NullifierUsed();

        bytes32[] memory publicInputs = new bytes32[](4);
        publicInputs[0] = newCommitment;
        publicInputs[1] = nullifierIn;
        publicInputs[2] = bytes32(uint256(merkleProofLength));
        publicInputs[3] = expectedRoot;

        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();
        nullifiers[nullifierIn] = true;
        emit TransferIntent(expectedRoot, nullifierIn, newCommitment);
    }

    /// @notice Withdraw arbitrary amount to the recipient in the proof (Standard mode).
    /// Public inputs: [value, nullifier, merkle_proof_length, expected_merkle_root, recipient].
    function withdraw(bytes calldata proof, bytes32[] calldata publicInputs) external nonReentrant whenNotPaused {
        if (publicInputs.length != 5) revert WrongPublicInputs();

        uint256 amount = uint256(publicInputs[0]);
        bytes32 nullifierIn = publicInputs[1];
        bytes32 expectedRoot = publicInputs[3];
        bytes32 recipientField = publicInputs[4];

        if (amount == 0) revert ZeroAmount();
        if (!isKnownRoot[expectedRoot]) revert UnknownRoot();
        if (nullifiers[nullifierIn]) revert NullifierUsed();
        if (!withdrawVerifier.verify(proof, publicInputs)) revert InvalidProof();

        nullifiers[nullifierIn] = true;
        address recipient = address(uint160(uint256(recipientField) & type(uint160).max));
        if (recipient == address(0)) revert RecipientZero();
        token.safeTransfer(recipient, amount);

        emit Withdraw(recipient, nullifierIn, amount);
    }

    /// @notice Withdraw a Private-mode note; amount comes from the denomination allowlist.
    /// Public inputs: [denomination_id, nullifier, merkle_proof_length, expected_merkle_root, recipient].
    function withdrawDenom(bytes calldata proof, bytes32[] calldata publicInputs)
        external
        nonReentrant
        whenNotPaused
    {
        if (address(withdrawDenomVerifier) == address(0)) revert DenomVerifierUnset();
        if (publicInputs.length != 5) revert WrongPublicInputs();

        uint256 denominationId = uint256(publicInputs[0]);
        if (denominationId >= _denominations.length) revert BadDenominationId();
        uint256 amount = _denominations[denominationId];
        if (amount == 0) revert ZeroAmount();

        bytes32 nullifierIn = publicInputs[1];
        bytes32 expectedRoot = publicInputs[3];
        bytes32 recipientField = publicInputs[4];

        if (!isKnownRoot[expectedRoot]) revert UnknownRoot();
        if (nullifiers[nullifierIn]) revert NullifierUsed();
        if (!withdrawDenomVerifier.verify(proof, publicInputs)) revert InvalidProof();

        nullifiers[nullifierIn] = true;
        address recipient = address(uint160(uint256(recipientField) & type(uint160).max));
        if (recipient == address(0)) revert RecipientZero();
        token.safeTransfer(recipient, amount);

        emit WithdrawDenom(recipient, nullifierIn, denominationId, amount);
    }
}
