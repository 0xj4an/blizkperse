/**
 * In-repo Poseidon2 (vendored from poseidon-lite@0.3.0).
 * Named import required: vendor is CJS with `exports.poseidon2` only (no default).
 * A default import makes webpack's `.default` undefined and crashes the client bundle.
 */
import { poseidon2 as poseidon2Hash } from "./vendor/poseidon-lite/poseidon2.js";

export { poseidon2Hash as poseidon2 };
export default poseidon2Hash;
