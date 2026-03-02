/**
 * Calls pool.withdraw(proof, publicInputs) to withdraw 1 USDC to the recipient.
 * publicInputs order: [value, nullifier, merkle_proof_length, expected_merkle_root, recipient].
 *
 * Requires: MONAD_RPC, PROOF_FILE. To sign the tx: B_PRIVATE_KEY (recommended for wallet B) or PRIVATE_KEY.
 * Optional: POOL_ADDRESS, WITHDRAW_VALUE, NULLIFIER, MERKLE_PROOF_LENGTH, EXPECTED_ROOT, RECIPIENT
 *           (if not provided, read from WithdrawProver.toml)
 *
 * Usage (wallet B in demo):
 *   B_PRIVATE_KEY=0x... PROOF_FILE=circuits/proofs/withdraw.proof node circuits/scripts/withdraw_one.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POOL_ABI = [
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "proof", type: "bytes" }, { name: "publicInputs", type: "bytes32[]" }], outputs: [] },
];

function bytes32(v) {
  if (typeof v === "string" && v.startsWith("0x")) {
    const hex = v.slice(2).padStart(64, "0").slice(-64);
    return "0x" + hex;
  }
  const n = BigInt(v);
  return "0x" + n.toString(16).padStart(64, "0");
}

function readWithdrawProverToml() {
  const tomlPath = path.resolve(__dirname, "..", "WithdrawProver.toml");
  if (!fs.existsSync(tomlPath)) return null;
  const content = fs.readFileSync(tomlPath, "utf8");
  const get = (key) => {
    const m = content.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`));
    return m ? m[1].trim() : null;
  };
  const merkleLen = content.match(/merkle_proof_length\s*=\s*(\d+)/);
  return {
    value: get("value"),
    nullifier: get("nullifier"),
    merkle_proof_length: merkleLen ? parseInt(merkleLen[1], 10) : 1,
    expected_merkle_root: get("expected_merkle_root"),
    recipient: get("recipient"),
  };
}

async function main() {
  const RPC = process.env.MONAD_RPC;
  const PK = process.env.B_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
  const POOL = process.env.POOL_ADDRESS ?? "0x085BD9c0C568BE5093130E2359B00e46cb0800d1";
  const proofFile = process.env.PROOF_FILE;

  if (!RPC || !PK) throw new Error("Set MONAD_RPC and B_PRIVATE_KEY (or PRIVATE_KEY)");
  if (!proofFile) throw new Error("Set PROOF_FILE to path of proof hex file (0x...)");
  let proofPath = path.resolve(proofFile);
  if (!fs.existsSync(proofPath)) {
    const alt = path.resolve(__dirname, "..", "proofs", path.basename(proofFile));
    if (fs.existsSync(alt)) proofPath = alt;
    else throw new Error(`PROOF_FILE not found: ${proofFile} (tried also ${alt})`);
  }

  let value = process.env.WITHDRAW_VALUE;
  let nullifier = process.env.NULLIFIER;
  let merkleProofLength = process.env.MERKLE_PROOF_LENGTH;
  let expectedRoot = process.env.EXPECTED_ROOT;
  let recipient = process.env.RECIPIENT;

  if (!value || !nullifier || !expectedRoot || !recipient) {
    const def = readWithdrawProverToml();
    if (def) {
      value = value ?? def.value ?? "0x1";
      nullifier = nullifier ?? def.nullifier;
      merkleProofLength = merkleProofLength ?? def.merkle_proof_length ?? 1;
      expectedRoot = expectedRoot ?? def.expected_merkle_root;
      recipient = recipient ?? def.recipient;
      console.log("Using public inputs from WithdrawProver.toml");
    }
  }

  if (!value || !nullifier || !expectedRoot || !recipient) {
    throw new Error("Set WITHDRAW_VALUE, NULLIFIER, EXPECTED_ROOT, RECIPIENT or run from repo with WithdrawProver.toml");
  }

  const publicInputs = [
    bytes32(value),
    bytes32(nullifier),
    bytes32(merkleProofLength ?? 1),
    bytes32(expectedRoot),
    bytes32(recipient),
  ];

  let proofHex = fs.readFileSync(proofPath, "utf8").trim();
  if (!proofHex.startsWith("0x")) proofHex = "0x" + proofHex;
  const proofBytes = ethers.getBytes(proofHex);

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  const pool = new ethers.Contract(POOL, POOL_ABI, wallet);

  console.log("Calling pool.withdraw(proof, publicInputs)...");
  console.log("Recipient (bytes32):", recipient);
  const tx = await pool.withdraw(proofBytes, publicInputs);
  console.log("withdraw tx:", tx.hash);
  await tx.wait();
  console.log("Withdraw done ✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
