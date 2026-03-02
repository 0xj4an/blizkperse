import { ethers } from "ethers";
import fs from "fs";

const RPC = "https://rpc3.monad.xyz";
const POOL = "0x085BD9c0C568BE5093130E2359B00e46cb0800d1";
const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const ABI = [{
  "type": "function",
  "name": "withdraw",
  "inputs": [{"name": "proof", "type": "bytes"}, {"name": "publicInputs", "type": "bytes32[]"}],
  "outputs": [],
  "stateMutability": "nonpayable"
}];

const proofBuffer = fs.readFileSync("./proofs/test_withdraw.proof");
const proofHex = "0x" + proofBuffer.toString("hex");

const publicInputs = [
  "0x0000000000000000000000000000000000000000000000000000000000000001",
  "0x172cb834370b69cc4185c2ddb9e617cf423784d5750b37f1392e633838811a95",
  "0x0000000000000000000000000000000000000000000000000000000000000001",
  "0x29c543220fc131a0694712e39b6249bfc7d8aac93aaa294d0d9aabb7423def7d",
  "0x000000000000000000000000e9f75e7eac8288473dc6e40e4c67707c07fa6a4e"
];

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);
const pool = new ethers.Contract(POOL, ABI, wallet);

console.log("Calling withdraw...");
console.log("Proof size:", proofHex.length, "chars");
console.log("Public inputs:", publicInputs);

try {
  const tx = await pool.withdraw(proofHex, publicInputs);
  console.log("TX hash:", tx.hash);
  await tx.wait();
  console.log("Success! ✅");
} catch (error) {
  console.error("Error:", error.message);
  if (error.data) console.error("Data:", error.data);
}
