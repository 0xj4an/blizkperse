/**
 * Llama pool.withdraw(proof, publicInputs) para retirar 1 USDC al recipient.
 * Orden publicInputs: [value, nullifier, merkle_proof_length, expected_merkle_root, recipient].
 *
 * Requiere: MONAD_RPC, PRIVATE_KEY, POOL_ADDRESS, PROOF_FILE (ruta a fichero con proof en hex 0x...)
 * Opcional: WITHDRAW_VALUE, NULLIFIER, MERKLE_PROOF_LENGTH, EXPECTED_ROOT, RECIPIENT
 *           (si no se pasan, se leen de WithdrawProver.toml)
 *
 * Nota: El WithdrawVerifier actual espera 4 public inputs (misma key que transfer).
 *       Hasta integrar la key del withdraw (5 inputs), esta tx fallará en verify().
 *
 * Uso:
 *   PROOF_FILE=circuits/proofs/withdraw.proof node circuits/scripts/withdraw_one.mjs
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
  const PK = process.env.PRIVATE_KEY;
  const POOL = process.env.POOL_ADDRESS ?? "0xD850AF48bDdf6E568A994a870aA684B86Bb5054f";
  const proofFile = process.env.PROOF_FILE;

  if (!RPC || !PK) throw new Error("Set MONAD_RPC, PRIVATE_KEY");
  if (!proofFile || !fs.existsSync(proofFile)) throw new Error("Set PROOF_FILE to path of proof hex file (0x...)");

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

  let proofHex = fs.readFileSync(proofFile, "utf8").trim();
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
