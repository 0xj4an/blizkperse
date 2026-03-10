import { decodeErrorResult } from "viem";

const abi = [
  {
    "type": "error",
    "name": "ProofLengthWrongWithLogN",
    "inputs": [
      { "name": "logN", "type": "uint256" },
      { "name": "actualLength", "type": "uint256" },
      { "name": "expectedLength", "type": "uint256" }
    ]
  }
];

const errorData = "0x59895a53" + "00000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000001c400000000000000000000000000000000000000000000000000000000000001b94"; 
// wait, I don't have the error data payload. I will write a script to simulate the contract call and get the exact error return data.
