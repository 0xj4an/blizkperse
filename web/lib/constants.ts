import { getAddress } from "viem";

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  address: `0x${string}`;
  /** If true, this ERC-20 is a WETH-style wrapper (e.g. WMON). Not used for Celo CELO (token duality). */
  wrapsNative?: boolean;
}

export interface PoolConfig {
  pool: `0x${string}`;
  token: TokenConfig;
  deployBlock: bigint;
}

export type ChainSlug = "monad" | "celo" | "robinhood";

export enum ChainId {
  MONAD = 143,
  MONAD_TESTNET = 10143,
  CELO = 42220,
  CELO_TESTNET = 11142220,
  ROBINHOOD = 4663,
  ROBINHOOD_TESTNET = 46630,
}

export type SupportedChainId = ChainId;

export interface ChainConfig {
  id: SupportedChainId;
  name: string;
  slug: ChainSlug;
  rpcUrl: string;
  explorerUrl: string;
  explorerName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  /** Single entrypoint for deposits/withdrawals. */
  router: `0x${string}`;
  contracts: {
    /** Default (USDC) pool — kept for backward-compatible indexing. */
    pool: `0x${string}`;
    verifier: `0x${string}`;
    withdrawVerifier: `0x${string}`;
    depositVerifier: `0x${string}`;
    stablecoin: `0x${string}`;
  };
  /** Map of symbol → pool config (USDC, USDT, COPm, WMON, CELO, …). */
  pools: Record<string, PoolConfig>;
  poolTokenDecimals: number;
  /** @deprecated Prefer pools[symbol].token amounts in raw units. Kept for legacy UI. */
  poolDenomination: bigint;
  tokens: TokenConfig[];
  defaultToken: TokenConfig;
  deployBlock: bigint;
  placeholder: boolean;
}

type DeployEnv = "production" | "development";

interface ChainDefaults {
  id: SupportedChainId;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  explorerName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  router: `0x${string}`;
  contracts: {
    pool: `0x${string}`;
    verifier: `0x${string}`;
    withdrawVerifier: `0x${string}`;
    depositVerifier: `0x${string}`;
    stablecoin: `0x${string}`;
  };
  poolTokenDecimals: number;
  poolDenomination: bigint;
  stablecoinSymbol: string;
  stablecoinName: string;
  poolTokens: TokenConfig[];
  /** Non-default token → ShieldedPool address (env can still override). */
  poolAddresses?: Record<string, `0x${string}`>;
  deployBlock: bigint;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

/**
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` when accessed as static property
 * lookups. Dynamic `process.env[name]` is undefined in the browser bundle, which
 * previously forced non-default pools (e.g. COPm) to `0x0` and hid them from the UI.
 */
const PUBLIC_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_BLIZ_ENV: process.env.NEXT_PUBLIC_BLIZ_ENV,
  NEXT_PUBLIC_DEFAULT_CHAIN: process.env.NEXT_PUBLIC_DEFAULT_CHAIN,
  NEXT_PUBLIC_PROTOCOL_FEE_BPS: process.env.NEXT_PUBLIC_PROTOCOL_FEE_BPS,

  NEXT_PUBLIC_CELO_CHAIN_ID: process.env.NEXT_PUBLIC_CELO_CHAIN_ID,
  NEXT_PUBLIC_CELO_RPC_URL: process.env.NEXT_PUBLIC_CELO_RPC_URL,
  NEXT_PUBLIC_CELO_EXPLORER_URL: process.env.NEXT_PUBLIC_CELO_EXPLORER_URL,
  NEXT_PUBLIC_CELO_ROUTER_ADDRESS: process.env.NEXT_PUBLIC_CELO_ROUTER_ADDRESS,
  NEXT_PUBLIC_CELO_POOL_ADDRESS: process.env.NEXT_PUBLIC_CELO_POOL_ADDRESS,
  NEXT_PUBLIC_CELO_POOL_USDT_ADDRESS: process.env.NEXT_PUBLIC_CELO_POOL_USDT_ADDRESS,
  NEXT_PUBLIC_CELO_POOL_USDC_ADDRESS: process.env.NEXT_PUBLIC_CELO_POOL_USDC_ADDRESS,
  NEXT_PUBLIC_CELO_POOL_COPM_ADDRESS: process.env.NEXT_PUBLIC_CELO_POOL_COPM_ADDRESS,
  NEXT_PUBLIC_CELO_POOL_CELO_ADDRESS: process.env.NEXT_PUBLIC_CELO_POOL_CELO_ADDRESS,
  NEXT_PUBLIC_CELO_TOKEN_USDT_ADDRESS: process.env.NEXT_PUBLIC_CELO_TOKEN_USDT_ADDRESS,
  NEXT_PUBLIC_CELO_TOKEN_USDC_ADDRESS: process.env.NEXT_PUBLIC_CELO_TOKEN_USDC_ADDRESS,
  NEXT_PUBLIC_CELO_TOKEN_COPM_ADDRESS: process.env.NEXT_PUBLIC_CELO_TOKEN_COPM_ADDRESS,
  NEXT_PUBLIC_CELO_TOKEN_CELO_ADDRESS: process.env.NEXT_PUBLIC_CELO_TOKEN_CELO_ADDRESS,
  NEXT_PUBLIC_CELO_VERIFIER_ADDRESS: process.env.NEXT_PUBLIC_CELO_VERIFIER_ADDRESS,
  NEXT_PUBLIC_CELO_WITHDRAW_VERIFIER_ADDRESS:
    process.env.NEXT_PUBLIC_CELO_WITHDRAW_VERIFIER_ADDRESS,
  NEXT_PUBLIC_CELO_DEPOSIT_VERIFIER_ADDRESS:
    process.env.NEXT_PUBLIC_CELO_DEPOSIT_VERIFIER_ADDRESS,
  NEXT_PUBLIC_CELO_STABLECOIN_ADDRESS: process.env.NEXT_PUBLIC_CELO_STABLECOIN_ADDRESS,
  NEXT_PUBLIC_CELO_STABLECOIN_SYMBOL: process.env.NEXT_PUBLIC_CELO_STABLECOIN_SYMBOL,
  NEXT_PUBLIC_CELO_POOL_TOKEN_DECIMALS: process.env.NEXT_PUBLIC_CELO_POOL_TOKEN_DECIMALS,
  NEXT_PUBLIC_CELO_POOL_DENOMINATION: process.env.NEXT_PUBLIC_CELO_POOL_DENOMINATION,
  NEXT_PUBLIC_CELO_DEPLOY_BLOCK: process.env.NEXT_PUBLIC_CELO_DEPLOY_BLOCK,
  NEXT_PUBLIC_CELO_PLACEHOLDER: process.env.NEXT_PUBLIC_CELO_PLACEHOLDER,

  NEXT_PUBLIC_MONAD_CHAIN_ID: process.env.NEXT_PUBLIC_MONAD_CHAIN_ID,
  NEXT_PUBLIC_MONAD_RPC_URL: process.env.NEXT_PUBLIC_MONAD_RPC_URL,
  NEXT_PUBLIC_MONAD_EXPLORER_URL: process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL,
  NEXT_PUBLIC_MONAD_ROUTER_ADDRESS: process.env.NEXT_PUBLIC_MONAD_ROUTER_ADDRESS,
  NEXT_PUBLIC_MONAD_POOL_ADDRESS: process.env.NEXT_PUBLIC_MONAD_POOL_ADDRESS,
  NEXT_PUBLIC_MONAD_POOL_USDC_ADDRESS: process.env.NEXT_PUBLIC_MONAD_POOL_USDC_ADDRESS,
  NEXT_PUBLIC_MONAD_POOL_USDT_ADDRESS: process.env.NEXT_PUBLIC_MONAD_POOL_USDT_ADDRESS,
  NEXT_PUBLIC_MONAD_POOL_WMON_ADDRESS: process.env.NEXT_PUBLIC_MONAD_POOL_WMON_ADDRESS,
  NEXT_PUBLIC_MONAD_TOKEN_USDC_ADDRESS: process.env.NEXT_PUBLIC_MONAD_TOKEN_USDC_ADDRESS,
  NEXT_PUBLIC_MONAD_TOKEN_USDT_ADDRESS: process.env.NEXT_PUBLIC_MONAD_TOKEN_USDT_ADDRESS,
  NEXT_PUBLIC_MONAD_TOKEN_WMON_ADDRESS: process.env.NEXT_PUBLIC_MONAD_TOKEN_WMON_ADDRESS,
  NEXT_PUBLIC_MONAD_VERIFIER_ADDRESS: process.env.NEXT_PUBLIC_MONAD_VERIFIER_ADDRESS,
  NEXT_PUBLIC_MONAD_WITHDRAW_VERIFIER_ADDRESS:
    process.env.NEXT_PUBLIC_MONAD_WITHDRAW_VERIFIER_ADDRESS,
  NEXT_PUBLIC_MONAD_DEPOSIT_VERIFIER_ADDRESS:
    process.env.NEXT_PUBLIC_MONAD_DEPOSIT_VERIFIER_ADDRESS,
  NEXT_PUBLIC_MONAD_STABLECOIN_ADDRESS: process.env.NEXT_PUBLIC_MONAD_STABLECOIN_ADDRESS,
  NEXT_PUBLIC_MONAD_STABLECOIN_SYMBOL: process.env.NEXT_PUBLIC_MONAD_STABLECOIN_SYMBOL,
  NEXT_PUBLIC_MONAD_POOL_TOKEN_DECIMALS: process.env.NEXT_PUBLIC_MONAD_POOL_TOKEN_DECIMALS,
  NEXT_PUBLIC_MONAD_POOL_DENOMINATION: process.env.NEXT_PUBLIC_MONAD_POOL_DENOMINATION,
  NEXT_PUBLIC_MONAD_DEPLOY_BLOCK: process.env.NEXT_PUBLIC_MONAD_DEPLOY_BLOCK,
  NEXT_PUBLIC_MONAD_PLACEHOLDER: process.env.NEXT_PUBLIC_MONAD_PLACEHOLDER,

  NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: process.env.NEXT_PUBLIC_ROBINHOOD_CHAIN_ID,
  NEXT_PUBLIC_ROBINHOOD_RPC_URL: process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL,
  NEXT_PUBLIC_ROBINHOOD_EXPLORER_URL: process.env.NEXT_PUBLIC_ROBINHOOD_EXPLORER_URL,
  NEXT_PUBLIC_ROBINHOOD_ROUTER_ADDRESS: process.env.NEXT_PUBLIC_ROBINHOOD_ROUTER_ADDRESS,
  NEXT_PUBLIC_ROBINHOOD_POOL_ADDRESS: process.env.NEXT_PUBLIC_ROBINHOOD_POOL_ADDRESS,
  NEXT_PUBLIC_ROBINHOOD_POOL_USDG_ADDRESS: process.env.NEXT_PUBLIC_ROBINHOOD_POOL_USDG_ADDRESS,
  NEXT_PUBLIC_ROBINHOOD_POOL_USDE_ADDRESS: process.env.NEXT_PUBLIC_ROBINHOOD_POOL_USDE_ADDRESS,
  NEXT_PUBLIC_ROBINHOOD_POOL_WETH_ADDRESS: process.env.NEXT_PUBLIC_ROBINHOOD_POOL_WETH_ADDRESS,
  NEXT_PUBLIC_ROBINHOOD_TOKEN_USDG_ADDRESS: process.env.NEXT_PUBLIC_ROBINHOOD_TOKEN_USDG_ADDRESS,
  NEXT_PUBLIC_ROBINHOOD_TOKEN_USDE_ADDRESS: process.env.NEXT_PUBLIC_ROBINHOOD_TOKEN_USDE_ADDRESS,
  NEXT_PUBLIC_ROBINHOOD_TOKEN_WETH_ADDRESS: process.env.NEXT_PUBLIC_ROBINHOOD_TOKEN_WETH_ADDRESS,
  NEXT_PUBLIC_ROBINHOOD_VERIFIER_ADDRESS: process.env.NEXT_PUBLIC_ROBINHOOD_VERIFIER_ADDRESS,
  NEXT_PUBLIC_ROBINHOOD_WITHDRAW_VERIFIER_ADDRESS:
    process.env.NEXT_PUBLIC_ROBINHOOD_WITHDRAW_VERIFIER_ADDRESS,
  NEXT_PUBLIC_ROBINHOOD_DEPOSIT_VERIFIER_ADDRESS:
    process.env.NEXT_PUBLIC_ROBINHOOD_DEPOSIT_VERIFIER_ADDRESS,
  NEXT_PUBLIC_ROBINHOOD_STABLECOIN_ADDRESS: process.env.NEXT_PUBLIC_ROBINHOOD_STABLECOIN_ADDRESS,
  NEXT_PUBLIC_ROBINHOOD_STABLECOIN_SYMBOL: process.env.NEXT_PUBLIC_ROBINHOOD_STABLECOIN_SYMBOL,
  NEXT_PUBLIC_ROBINHOOD_POOL_TOKEN_DECIMALS: process.env.NEXT_PUBLIC_ROBINHOOD_POOL_TOKEN_DECIMALS,
  NEXT_PUBLIC_ROBINHOOD_POOL_DENOMINATION: process.env.NEXT_PUBLIC_ROBINHOOD_POOL_DENOMINATION,
  NEXT_PUBLIC_ROBINHOOD_DEPLOY_BLOCK: process.env.NEXT_PUBLIC_ROBINHOOD_DEPLOY_BLOCK,
  NEXT_PUBLIC_ROBINHOOD_PLACEHOLDER: process.env.NEXT_PUBLIC_ROBINHOOD_PLACEHOLDER,
};

const DEPLOY_ENV: DeployEnv =
  PUBLIC_ENV.NEXT_PUBLIC_BLIZ_ENV === "development" ? "development" : "production";
const MONAD_CHAIN_IDS = new Set<SupportedChainId>([
  ChainId.MONAD,
  ChainId.MONAD_TESTNET,
]);
const CELO_CHAIN_IDS = new Set<SupportedChainId>([
  ChainId.CELO,
  ChainId.CELO_TESTNET,
]);
const ROBINHOOD_CHAIN_IDS = new Set<SupportedChainId>([
  ChainId.ROBINHOOD,
  ChainId.ROBINHOOD_TESTNET,
]);
const ALL_CHAIN_IDS = new Set<SupportedChainId>([
  ChainId.MONAD,
  ChainId.MONAD_TESTNET,
  ChainId.CELO,
  ChainId.CELO_TESTNET,
  ChainId.ROBINHOOD,
  ChainId.ROBINHOOD_TESTNET,
]);
const CHAIN_IDS_BY_SLUG: Record<ChainSlug, Set<SupportedChainId>> = {
  monad: MONAD_CHAIN_IDS,
  celo: CELO_CHAIN_IDS,
  robinhood: ROBINHOOD_CHAIN_IDS,
};

const MONAD_USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;
const MONAD_USDT = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D" as const;
/** Wrapped MON (WETH-style) on Monad mainnet. */
const MONAD_WMON = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A" as const;

const CELO_USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;
const CELO_USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as const;
/** Celo Colombian peso stablecoin (EIP-55). Override via NEXT_PUBLIC_CELO_TOKEN_COPM_ADDRESS. */
const CELO_COPM = "0x8A567e2aE79CA692Bd748aB832081C45de4041eA" as const;
/** Celo GoldToken: native CELO ↔ ERC-20 duality (no wrap/unwrap). */
const CELO_TOKEN = "0x471EcE3750Da237f93B8E339c536989b8978a438" as const;

/** Robinhood mainnet tokens (verified via public RPC). */
const ROBINHOOD_USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;
const ROBINHOOD_USDE = "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34" as const;
/** Wrapped ETH on Robinhood — WETH-style wrap/unwrap (Monad WMON pattern). */
const ROBINHOOD_WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as const;

const PROD_DEFAULTS: Record<ChainSlug, ChainDefaults> = {
  monad: {
    id: ChainId.MONAD,
    name: "Monad",
    rpcUrl: "https://rpc3.monad.xyz",
    explorerUrl: "https://monadexplorer.com",
    explorerName: "Monad Explorer",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    router: ZERO_ADDR,
    contracts: {
      pool: "0x97268f95e49bC5C7C8711111cCFe509D76C00674",
      verifier: "0x4eE52aEb000B91853A5a6f9db9B1f969f1b0c393",
      withdrawVerifier: "0x0D70d098085CeD93864B41cD0fF506C2CD329D94",
      depositVerifier: ZERO_ADDR,
      stablecoin: MONAD_USDC,
    },
    poolTokenDecimals: 6,
    poolDenomination: BigInt(1_000_000),
    stablecoinSymbol: "USDC",
    stablecoinName: "USD Coin",
    poolTokens: [
      { symbol: "USDC", name: "USD Coin", decimals: 6, address: MONAD_USDC },
      { symbol: "USDT", name: "Tether USD", decimals: 6, address: MONAD_USDT },
      { symbol: "WMON", name: "Wrapped MON", decimals: 18, address: MONAD_WMON, wrapsNative: true },
    ],
    deployBlock: BigInt(60_840_463),
  },
  celo: {
    id: ChainId.CELO,
    name: "Celo",
    rpcUrl: "https://forno.celo.org",
    explorerUrl: "https://celoscan.io",
    explorerName: "CeloScan",
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    router: ZERO_ADDR,
    contracts: {
      // Default / legacy pool entry = USDT pool (not USDC).
      pool: "0x4319216C4f9343702Bee96345da0099F3dD5a7C1",
      verifier: "0x3D76FC7Ce515aB1d69A4e734354c6EC94c22CCb9",
      withdrawVerifier: "0x6e4794166dE8Af43D1720f66bA39f561F2C0eD95",
      depositVerifier: ZERO_ADDR,
      stablecoin: CELO_USDT,
    },
    poolTokenDecimals: 6,
    poolDenomination: BigInt(1_000_000),
    stablecoinSymbol: "USDT",
    stablecoinName: "Tether USD",
    poolTokens: [
      { symbol: "USDT", name: "Tether USD", decimals: 6, address: CELO_USDT },
      { symbol: "USDC", name: "USD Coin", decimals: 6, address: CELO_USDC },
      { symbol: "COPm", name: "Celo Colombian Peso", decimals: 18, address: CELO_COPM },
      { symbol: "CELO", name: "Celo", decimals: 18, address: CELO_TOKEN },
    ],
    poolAddresses: {
      // Live COPm ShieldedPool on Celo mainnet (also set via NEXT_PUBLIC_CELO_POOL_COPM_ADDRESS).
      COPm: "0x5862FFF8085d009354d78273DC8f8545f51dB72F",
    },
    deployBlock: BigInt(61_379_350),
  },
  robinhood: {
    id: ChainId.ROBINHOOD,
    name: "Robinhood Chain",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    explorerName: "Robinhood Chain Explorer",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    router: "0xcDc6AdE9d348572f302690bD39BA8120F8E91db3",
    contracts: {
      // Default pool entry = USDG (stablecoin).
      pool: "0xf62E5a932a832C8EA990DedD87a05162C8905224",
      verifier: "0x8d10Ad45B21d4db2e7270E519a757c764c6501Ac",
      withdrawVerifier: "0xD9AeE9351f7685b05a6B7BD8c1Ca509D24bE1e57",
      depositVerifier: "0x1d42C0cD5fF14Ee71456473828996b1bC251a735",
      stablecoin: ROBINHOOD_USDG,
    },
    poolTokenDecimals: 6,
    poolDenomination: BigInt(1_000_000),
    stablecoinSymbol: "USDG",
    stablecoinName: "Global Dollar",
    poolTokens: [
      { symbol: "USDG", name: "Global Dollar", decimals: 6, address: ROBINHOOD_USDG },
      { symbol: "USDe", name: "USDe", decimals: 18, address: ROBINHOOD_USDE },
      {
        symbol: "WETH",
        name: "WETH",
        decimals: 18,
        address: ROBINHOOD_WETH,
        wrapsNative: true,
      },
    ],
    poolAddresses: {
      USDe: "0x038803A40130734E6aB711489060Ea55F05BB475",
      WETH: "0x27c575a0CDbBAcCFaCC6085164186B19F74b77B4",
    },
    deployBlock: BigInt(20_324_129),
  },
};

const DEV_DEFAULTS: Record<ChainSlug, ChainDefaults> = {
  monad: {
    id: ChainId.MONAD_TESTNET,
    name: "Monad Testnet",
    rpcUrl: "https://testnet-rpc.monad.xyz",
    explorerUrl: "https://testnet.monadvision.com/",
    explorerName: "Monad Explorer",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    router: ZERO_ADDR,
    contracts: {
      pool: "0xcdc6ade9d348572f302690bd39ba8120f8e91db3",
      verifier: "0x8d10ad45b21d4db2e7270e519a757c764c6501ac",
      withdrawVerifier: "0xd9aee9351f7685b05a6b7bd8c1ca509d24be1e57",
      depositVerifier: ZERO_ADDR,
      stablecoin: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
    },
    poolTokenDecimals: 6,
    poolDenomination: BigInt(1_000_000),
    stablecoinSymbol: "USDC",
    stablecoinName: "USD Coin",
    poolTokens: [
      {
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        address: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
      },
    ],
    deployBlock: BigInt(17992500),
  },
  celo: {
    id: ChainId.CELO_TESTNET,
    name: "Celo Testnet",
    rpcUrl: "https://forno.celo-sepolia.celo-testnet.org/",
    explorerUrl: "https://celo-sepolia.blockscout.com",
    explorerName: "Celo Explorer",
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    router: ZERO_ADDR,
    contracts: {
      pool: "0x038803a40130734e6ab711489060ea55f05bb475",
      verifier: "0x0f86796c3f3254442debd0705a56bdd82c69f4a6",
      withdrawVerifier: "0xd850af48bddf6e568a994a870aa684b86bb5054f",
      depositVerifier: ZERO_ADDR,
      stablecoin: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
    },
    poolTokenDecimals: 6,
    poolDenomination: BigInt(1_000_000),
    stablecoinSymbol: "USDC",
    stablecoinName: "USD Coin",
    poolTokens: [
      {
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        address: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
      },
    ],
    deployBlock: BigInt(19901100),
  },
  /** No dedicated RH testnet deploy yet — env overrides point at mainnet 4663. */
  robinhood: {
    id: ChainId.ROBINHOOD_TESTNET,
    name: "Robinhood Chain Testnet",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    explorerName: "Robinhood Chain Explorer",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    router: ZERO_ADDR,
    contracts: {
      pool: ZERO_ADDR,
      verifier: ZERO_ADDR,
      withdrawVerifier: ZERO_ADDR,
      depositVerifier: ZERO_ADDR,
      stablecoin: ROBINHOOD_USDG,
    },
    poolTokenDecimals: 6,
    poolDenomination: BigInt(1_000_000),
    stablecoinSymbol: "USDG",
    stablecoinName: "Global Dollar",
    poolTokens: [
      { symbol: "USDG", name: "Global Dollar", decimals: 6, address: ROBINHOOD_USDG },
      { symbol: "USDe", name: "USDe", decimals: 18, address: ROBINHOOD_USDE },
      {
        symbol: "WETH",
        name: "WETH",
        decimals: 18,
        address: ROBINHOOD_WETH,
        wrapsNative: true,
      },
    ],
    deployBlock: BigInt(0),
  },
};

const DEFAULTS = DEPLOY_ENV === "development" ? DEV_DEFAULTS : PROD_DEFAULTS;

function getEnv(name: string): string | undefined {
  const value = (PUBLIC_ENV[name] ?? process.env[name])?.trim();
  return value ? value : undefined;
}

function getEnvNumber(name: string, fallback: number): number {
  const value = getEnv(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isKnownChainId(value: number): value is SupportedChainId {
  return ALL_CHAIN_IDS.has(value as SupportedChainId);
}

function isChainIdValidForSlug(slug: ChainSlug, value: SupportedChainId): boolean {
  return CHAIN_IDS_BY_SLUG[slug].has(value);
}

function getEnvChainId(
  name: string,
  slug: ChainSlug,
  fallback: SupportedChainId,
): SupportedChainId {
  const parsed = getEnvNumber(name, fallback);
  if (!isKnownChainId(parsed)) {
    throw new Error(`Invalid chain id in ${name}: ${parsed}`);
  }
  if (!isChainIdValidForSlug(slug, parsed)) {
    throw new Error(`Chain id ${parsed} is not valid for ${slug}`);
  }
  return parsed;
}

function getEnvBigInt(name: string, fallback: bigint): bigint {
  const value = getEnv(name);
  if (!value) return fallback;
  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
}

function isAddress(value: string | undefined): value is `0x${string}` {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}

/**
 * Normalize to EIP-55. Lowercase first so a mixed-case but *wrong* checksum in
 * env (e.g. COPm `BD748` vs `Bd748`) still works — viem rejects bad checksums in
 * `readContract`, and `getAllBalances` was swallowing that as a 0 balance.
 */
function checksumAddress(value: `0x${string}`): `0x${string}` {
  return getAddress(value.toLowerCase() as `0x${string}`);
}

function getEnvAddress(name: string, fallback: `0x${string}`): `0x${string}` {
  const value = getEnv(name);
  if (!isAddress(value)) return checksumAddress(fallback);
  return checksumAddress(value);
}

function getEnvBoolean(name: string): boolean | undefined {
  const value = getEnv(name)?.toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function buildChainConfig(slug: ChainSlug): ChainConfig {
  const prefix = `NEXT_PUBLIC_${slug.toUpperCase()}`;
  const defaults = DEFAULTS[slug];

  const id = getEnvChainId(`${prefix}_CHAIN_ID`, slug, defaults.id);
  const name = defaults.name;
  const rpcUrl = getEnv(`${prefix}_RPC_URL`) ?? defaults.rpcUrl;
  const explorerUrl = getEnv(`${prefix}_EXPLORER_URL`) ?? defaults.explorerUrl;
  const explorerName = defaults.explorerName;
  const poolTokenDecimals = getEnvNumber(
    `${prefix}_POOL_TOKEN_DECIMALS`,
    defaults.poolTokenDecimals,
  );
  const poolDenomination = getEnvBigInt(
    `${prefix}_POOL_DENOMINATION`,
    defaults.poolDenomination,
  );
  const stablecoin = getEnvAddress(
    `${prefix}_STABLECOIN_ADDRESS`,
    defaults.contracts.stablecoin,
  );
  const defaultToken: TokenConfig = {
    symbol: getEnv(`${prefix}_STABLECOIN_SYMBOL`) ?? defaults.stablecoinSymbol,
    name: defaults.stablecoinName,
    decimals: poolTokenDecimals,
    address: stablecoin,
  };

  const router = getEnvAddress(`${prefix}_ROUTER_ADDRESS`, defaults.router);
  const usdcPool = getEnvAddress(`${prefix}_POOL_ADDRESS`, defaults.contracts.pool);
  const depositVerifier = getEnvAddress(
    `${prefix}_DEPOSIT_VERIFIER_ADDRESS`,
    defaults.contracts.depositVerifier,
  );

  const pools: Record<string, PoolConfig> = {};
  for (const t of defaults.poolTokens) {
    // Match on resolved defaultToken.symbol (env-aware), never alias another
    // token (e.g. USDC) onto the default stablecoin pool (e.g. USDT).
    const isDefault = t.symbol === defaultToken.symbol;
    const tokenAddr = getEnvAddress(
      `${prefix}_TOKEN_${t.symbol.toUpperCase()}_ADDRESS`,
      isDefault ? stablecoin : t.address,
    );
    const hardcodedPool =
      defaults.poolAddresses?.[t.symbol] ??
      (isDefault ? usdcPool : ZERO_ADDR);
    const poolAddr = getEnvAddress(
      `${prefix}_POOL_${t.symbol.toUpperCase()}_ADDRESS`,
      hardcodedPool,
    );
    const token: TokenConfig = {
      ...t,
      address: tokenAddr,
    };
    pools[t.symbol] = {
      pool: poolAddr,
      token,
      deployBlock: getEnvBigInt(`${prefix}_DEPLOY_BLOCK`, defaults.deployBlock),
    };
  }

  // Ensure default token pool exists
  if (!pools[defaultToken.symbol]) {
    pools[defaultToken.symbol] = {
      pool: usdcPool,
      token: defaultToken,
      deployBlock: defaults.deployBlock,
    };
  }

  const computedPlaceholder =
    !rpcUrl ||
    !explorerUrl ||
    stablecoin === ZERO_ADDR ||
    usdcPool === ZERO_ADDR ||
    getEnvAddress(`${prefix}_VERIFIER_ADDRESS`, defaults.contracts.verifier) === ZERO_ADDR ||
    getEnvAddress(
      `${prefix}_WITHDRAW_VERIFIER_ADDRESS`,
      defaults.contracts.withdrawVerifier,
    ) === ZERO_ADDR ||
    getEnvBigInt(`${prefix}_DEPLOY_BLOCK`, defaults.deployBlock) <= BigInt(0);

  const placeholder =
    getEnvBoolean(`${prefix}_PLACEHOLDER`) ?? computedPlaceholder;

  const tokens = Object.values(pools)
    .map((p) => p.token)
    .filter((t) => t.address !== ZERO_ADDR || t.symbol === defaultToken.symbol);

  return {
    id,
    name,
    slug,
    rpcUrl,
    explorerUrl,
    explorerName,
    nativeCurrency: defaults.nativeCurrency,
    router,
    contracts: {
      pool: usdcPool,
      verifier: getEnvAddress(`${prefix}_VERIFIER_ADDRESS`, defaults.contracts.verifier),
      withdrawVerifier: getEnvAddress(
        `${prefix}_WITHDRAW_VERIFIER_ADDRESS`,
        defaults.contracts.withdrawVerifier,
      ),
      depositVerifier,
      stablecoin,
    },
    pools,
    poolTokenDecimals,
    poolDenomination,
    tokens,
    defaultToken,
    deployBlock: getEnvBigInt(`${prefix}_DEPLOY_BLOCK`, defaults.deployBlock),
    placeholder,
  };
}

const monadChain = buildChainConfig("monad");
const celoChain = buildChainConfig("celo");
const robinhoodChain = buildChainConfig("robinhood");

if (monadChain.id === celoChain.id) {
  throw new Error("Monad and Celo chain IDs must be different");
}
if (
  robinhoodChain.id === monadChain.id ||
  robinhoodChain.id === celoChain.id
) {
  throw new Error("Robinhood chain ID must differ from Monad and Celo");
}

export const CHAINS: Record<number, ChainConfig> = Object.freeze({
  [celoChain.id]: celoChain,
  [monadChain.id]: monadChain,
  [robinhoodChain.id]: robinhoodChain,
});

export const CHAIN_IDS = Object.freeze([
  celoChain.id,
  monadChain.id,
  robinhoodChain.id,
]);

const defaultChainSlug = getEnv("NEXT_PUBLIC_DEFAULT_CHAIN") as ChainSlug | undefined;

export const DEFAULT_CHAIN_ID =
  defaultChainSlug === "monad"
    ? monadChain.id
    : defaultChainSlug === "robinhood"
      ? robinhoodChain.id
      : defaultChainSlug === "celo"
        ? celoChain.id
        : celoChain.id;

export function isSupportedChainId(value: unknown): value is SupportedChainId {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    isKnownChainId(value) &&
    value in CHAINS
  );
}

export function getPoolConfig(config: ChainConfig, symbol: string): PoolConfig {
  const pool = config.pools[symbol];
  if (!pool) {
    throw new Error(`No pool configured for token ${symbol} on ${config.name}`);
  }
  return pool;
}

/** Protocol fee in basis points (30 = 0.3%). Must match PoolRouter.feeBps after deploy. */
export const PROTOCOL_FEE_BPS = Number(PUBLIC_ENV.NEXT_PUBLIC_PROTOCOL_FEE_BPS ?? "30");
export const FEE_BPS_DENOM = 10_000;

/** Fee charged on top of the note/pool amount (raw units). */
export function quoteProtocolFee(amountRaw: bigint, feeBps: number = PROTOCOL_FEE_BPS): bigint {
  if (feeBps <= 0 || amountRaw <= 0n) return 0n;
  return (amountRaw * BigInt(feeBps)) / BigInt(FEE_BPS_DENOM);
}

/** Gross payer cost = note amount + protocol fee. */
export function quoteProtocolGross(amountRaw: bigint, feeBps: number = PROTOCOL_FEE_BPS): bigint {
  return amountRaw + quoteProtocolFee(amountRaw, feeBps);
}

/** Sum of per-note gross costs (fee is charged on top of each note). */
export function quoteNotesGross(rawAmounts: bigint[], feeBps: number = PROTOCOL_FEE_BPS): bigint {
  return rawAmounts.reduce((sum, raw) => sum + quoteProtocolGross(raw, feeBps), 0n);
}

/**
 * Largest net (note) total such that net + fee(net) ≤ balanceRaw when fee is on top.
 * Uses integer division; for multiple notes prefer {@link scaleRawNotesToFitGross}.
 */
export function quoteMaxNetFromBalance(
  balanceRaw: bigint,
  feeBps: number = PROTOCOL_FEE_BPS,
): bigint {
  if (balanceRaw <= 0n) return 0n;
  if (feeBps <= 0) return balanceRaw;
  return (balanceRaw * BigInt(FEE_BPS_DENOM)) / BigInt(FEE_BPS_DENOM + feeBps);
}

/**
 * Clear shortfall copy for deposit / createPayout balance checks.
 * Avoids confusing "reduce notes to ≤ 0" when the wallet cannot fund any note after fee.
 */
export function formatInsufficientDepositBalanceMessage(params: {
  symbol: string;
  decimals: number;
  haveRaw: bigint;
  netRaw: bigint;
  feeRaw: bigint;
  grossRaw: bigint;
  feePct: number;
  maxNetRaw: bigint;
  /** Include symbol on each amount (UI toast) vs bare numbers (createPayout throw). */
  withSymbol?: boolean;
}): string {
  const {
    symbol,
    decimals,
    haveRaw,
    netRaw,
    feeRaw,
    grossRaw,
    feePct,
    maxNetRaw,
    withSymbol = false,
  } = params;
  const fmt = (raw: bigint) => {
    const n = formatTokenRawAmount(raw, decimals);
    return withSymbol ? `${n} ${symbol}` : n;
  };
  const have = fmt(haveRaw);
  const net = fmt(netRaw);
  const fee = fmt(feeRaw);
  const gross = fmt(grossRaw);
  const shortfall = grossRaw > haveRaw ? grossRaw - haveRaw : 0n;
  const head = withSymbol
    ? `Insufficient balance: you have ${have}. Notes (net): ${net}. Fee (${feePct}%): ${fee}. Gross required (notes + fee): ${gross}.`
    : `Insufficient ${symbol} balance: you have ${have}. Notes (net): ${net}. Fee (${feePct}%): ${fee}. Gross required: ${gross}.`;

  if (maxNetRaw <= 0n) {
    const need = fmt(shortfall > 0n ? shortfall : grossRaw);
    return `${head} Your balance is too low to fund any notes after the fee — top up at least ${need} (plus native gas).`;
  }

  const maxNet = fmt(maxNetRaw);
  if (shortfall > 0n) {
    return `${head} Reduce notes to ≤ ${maxNet} or top up at least ${fmt(shortfall)}.`;
  }
  return `${head} Reduce notes to ≤ ${maxNet} or top up the difference.`;
}

/**
 * Scale raw note amounts proportionally so sum(note + fee(note)) ≤ balanceRaw.
 * Returns null if balance cannot cover any positive note+fee.
 */
export function scaleRawNotesToFitGross(
  rawAmounts: bigint[],
  balanceRaw: bigint,
  feeBps: number = PROTOCOL_FEE_BPS,
): bigint[] | null {
  if (rawAmounts.length === 0) return null;
  const currentGross = quoteNotesGross(rawAmounts, feeBps);
  if (currentGross <= balanceRaw) return rawAmounts;
  if (balanceRaw <= 0n) return null;

  const netTotal = rawAmounts.reduce((a, r) => a + r, 0n);
  if (netTotal <= 0n) return null;

  const targetNet = quoteMaxNetFromBalance(balanceRaw, feeBps);
  if (targetNet <= 0n) return null;

  const scaled = rawAmounts.map((r) => (r * targetNet) / netTotal);
  const grossOf = (amounts: bigint[]) => quoteNotesGross(amounts, feeBps);

  let gross = grossOf(scaled);
  let guard = 0;
  while (gross > balanceRaw && guard < 100_000) {
    let maxIdx = 0;
    for (let i = 1; i < scaled.length; i++) {
      if (scaled[i]! > scaled[maxIdx]!) maxIdx = i;
    }
    if (scaled[maxIdx]! <= 0n) return null;
    scaled[maxIdx]! -= 1n;
    gross = grossOf(scaled);
    guard += 1;
  }

  if (gross > balanceRaw) return null;
  if (scaled.every((r) => r <= 0n)) return null;
  return scaled;
}

/** Human-readable token amount from raw units (lossy; for UI display). */
export function fromTokenRawAmount(raw: bigint, decimals: number): number {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (!fracStr) return Number(whole);
  return Number(`${whole}.${fracStr}`);
}

/**
 * Exact decimal string from raw units (no IEEE-754 drift). Truncates display
 * fractions; does not round up.
 */
export function formatTokenRawAmount(
  raw: bigint,
  decimals: number,
  maxFracDigits = 8,
): string {
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = v % base;
  const fracDigits = Math.min(decimals, Math.max(0, maxFracDigits));
  if (decimals > fracDigits) {
    frac = frac / 10n ** BigInt(decimals - fracDigits);
  }
  const fracStr = frac
    .toString()
    .padStart(fracDigits, "0")
    .replace(/0+$/, "");
  const sign = neg ? "-" : "";
  if (!fracStr) return `${sign}${whole.toString()}`;
  return `${sign}${whole.toString()}.${fracStr}`;
}

/**
 * Convert raw → JS number truncated so `toTokenRawAmount(result, decimals) ≤ raw`.
 * Required for 18-decimal tokens (e.g. COPm): `Number` cannot hold full wei
 * precision, and a naive round-trip via {@link fromTokenRawAmount} can inflate
 * notes so that net + fee exceeds the wallet balance (USDT 6dp is unaffected).
 */
export function fromTokenRawAmountUi(raw: bigint, decimals: number): number {
  if (raw <= 0n) return 0;
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  // ~15 significant digits total in IEEE-754 doubles.
  const wholeDigits = whole.toString().length;
  const maxFracDigits = Math.max(0, Math.min(decimals, 15 - wholeDigits));
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFracDigits)
    .replace(/0+$/, "");
  if (!fracStr) return Number(whole);
  return Number(`${whole.toString()}.${fracStr}`);
}

/** Convert a human decimal amount string/number to raw token units. */
export function toTokenRawAmount(amount: number | string, decimals: number): bigint {
  const asString =
    typeof amount === "string"
      ? amount.trim()
      : Number.isFinite(amount)
        ? amount.toString()
        : "";
  if (!asString || asString === "NaN") {
    throw new Error("Amount must be a positive number");
  }
  // Reject scientific notation from Number.toString() for tiny values — parse via parts.
  if (/[eE]/.test(asString)) {
    const n = typeof amount === "number" ? amount : Number(asString);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("Amount must be a positive number");
    }
    // Fall back to fixed expansion with enough fraction digits.
    const fixed = n.toFixed(decimals);
    return toTokenRawAmount(fixed, decimals);
  }
  const neg = asString.startsWith("-");
  const unsigned = neg ? asString.slice(1) : asString;
  const [whole, frac = ""] = unsigned.split(".");
  if (!/^\d*$/.test(whole || "0") || !/^\d*$/.test(frac)) {
    throw new Error("Amount must be a positive number");
  }
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const raw =
    BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
  if (neg || raw <= 0n) throw new Error("Amount must be a positive number");
  return raw;
}
