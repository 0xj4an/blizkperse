import fs from 'fs';
const envLine = fs.readFileSync('.env', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const env = {};
envLine.forEach(l => {
  const [k, v] = l.split('=');
  if(k && v) env[k] = v;
});

const prefix = 'NEXT_PUBLIC_CELO';
const defaults = {
    rpcUrl: "",
    explorerUrl: "",
    contracts: {
      pool: "0x0000000000000000000000000000000000000000",
      verifier: "0x0000000000000000000000000000000000000000",
      withdrawVerifier: "0x0000000000000000000000000000000000000000",
      stablecoin: "0x0000000000000000000000000000000000000000",
    },
    deployBlock: 0n,
}; // DEV DEFAULTS

function getEnv(name) { return env[name]?.trim() }
const rpcUrl = getEnv(`${prefix}_RPC_URL`) ?? defaults.rpcUrl;
const explorerUrl = getEnv(`${prefix}_EXPLORER_URL`) ?? defaults.explorerUrl;
const stablecoin = getEnv(`${prefix}_STABLECOIN_ADDRESS`) ?? defaults.contracts.stablecoin;
const pool = getEnv(`${prefix}_POOL_ADDRESS`) ?? defaults.contracts.pool;
const verifier = getEnv(`${prefix}_VERIFIER_ADDRESS`) ?? defaults.contracts.verifier;
const withdrawVerifier = getEnv(`${prefix}_WITHDRAW_VERIFIER_ADDRESS`) ?? defaults.contracts.withdrawVerifier;
const deployBlock = BigInt(getEnv(`${prefix}_DEPLOY_BLOCK`) ?? defaults.deployBlock);

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const computedPlaceholder =
    !rpcUrl ||
    !explorerUrl ||
    stablecoin === ZERO_ADDR ||
    pool === ZERO_ADDR ||
    verifier === ZERO_ADDR ||
    withdrawVerifier === ZERO_ADDR ||
    deployBlock <= 0n;

const placeholderStr = getEnv(`${prefix}_PLACEHOLDER`);
let placeholder = computedPlaceholder;
if (placeholderStr === 'true') placeholder = true;
if (placeholderStr === 'false') placeholder = false;

console.log({
  rpcUrl,
  explorerUrl,
  stablecoin,
  pool,
  verifier,
  withdrawVerifier,
  deployBlock: deployBlock.toString(),
  computed: computedPlaceholder,
  envOverride: placeholderStr,
  final: placeholder
});
