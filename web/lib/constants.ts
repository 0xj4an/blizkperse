export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  address: `0x${string}`;
}

export type ChainSlug = "monad" | "celo";

export enum ChainId {
  MONAD = 143,
  MONAD_TESTNET = 10143,
  CELO = 42220,
  CELO_TESTNET = 11142220,
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
  contracts: {
    pool: `0x${string}`;
    verifier: `0x${string}`;
    withdrawVerifier: `0x${string}`;
    stablecoin: `0x${string}`;
  };
  poolTokenDecimals: number;
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
  contracts: {
    pool: `0x${string}`;
    verifier: `0x${string}`;
    withdrawVerifier: `0x${string}`;
    stablecoin: `0x${string}`;
  };
  poolTokenDecimals: number;
  poolDenomination: bigint;
  stablecoinSymbol: string;
  stablecoinName: string;
  extraTokens: TokenConfig[];
  deployBlock: bigint;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
const DEPLOY_ENV: DeployEnv =
  process.env.NEXT_PUBLIC_BLIZ_ENV === "development" ? "development" : "production";

const MONAD_CHAIN_IDS = new Set<SupportedChainId>([
  ChainId.MONAD,
  ChainId.MONAD_TESTNET,
]);
const CELO_CHAIN_IDS = new Set<SupportedChainId>([
  ChainId.CELO,
  ChainId.CELO_TESTNET,
]);
const ALL_CHAIN_IDS = new Set<SupportedChainId>([
  ChainId.MONAD,
  ChainId.MONAD_TESTNET,
  ChainId.CELO,
  ChainId.CELO_TESTNET,
]);

const MONAD_USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;
const MONAD_USDT = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D" as const;

const CELO_USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;
const CELO_USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as const;


const PROD_DEFAULTS: Record<ChainSlug, ChainDefaults> = {
  monad: {
    id: ChainId.MONAD,
    name: "Monad",
    rpcUrl: "https://rpc3.monad.xyz",
    explorerUrl: "https://monadexplorer.com",
    explorerName: "Monad Explorer",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    contracts: {
      pool: "0x8d44379c778Cb714B72FcaD80dcb5EC7c031343c",
      verifier: "0x6b11b3eB54Bbda485D616150A4C85E8629e1A552",
      withdrawVerifier: "0x4d900D53514140755fe842eb3e0d53b12BBcCD24",
      stablecoin: MONAD_USDC,
    },
    poolTokenDecimals: 6,
    poolDenomination: BigInt(1_000_000),
    stablecoinSymbol: "USDC",
    stablecoinName: "USD Coin",
    extraTokens: [
      { symbol: "USDT", name: "Tether USD", decimals: 6, address: MONAD_USDT },
    ],
    deployBlock: BigInt(58_002_970),
  },
  celo: {
    id: ChainId.CELO,
    name: "Celo",
    rpcUrl: "https://forno.celo.org",
    explorerUrl: "https://celoscan.io",
    explorerName: "CeloScan",
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    contracts: {
      pool: "0xcE61001eb3Cd531784D2Cee9DDAbB17a3fc6B16A",
      verifier: "0x085BD9c0C568BE5093130E2359B00e46cb0800d1",
      withdrawVerifier: "0xfe231dd394Df5863B02BfA9CFA50f4877961d5b7",
      stablecoin: CELO_USDC,
    },
    poolTokenDecimals: 6,
    poolDenomination: BigInt(1_000_000),
    stablecoinSymbol: "USDC",
    stablecoinName: "USD Coin",
    extraTokens: [
      { symbol: "USDT", name: "Tether USD", decimals: 6, address: CELO_USDT },
    ],
    deployBlock: BigInt(60_249_143),
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
    contracts: {
      pool: "0xcdc6ade9d348572f302690bd39ba8120f8e91db3",
      verifier: "0x8d10ad45b21d4db2e7270e519a757c764c6501ac",
      withdrawVerifier: "0xd9aee9351f7685b05a6b7bd8c1ca509d24be1e57",
      stablecoin: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
    },
    poolTokenDecimals: 6,
    poolDenomination: BigInt(1_000_000),
    stablecoinSymbol: "USDC",
    stablecoinName: "USD Coin",
    extraTokens: [],
    deployBlock: BigInt(17992500),
  },
  celo: {
    id: ChainId.CELO_TESTNET,
    name: "Celo Testnet",
    rpcUrl: "https://forno.celo-sepolia.celo-testnet.org/",
    explorerUrl: "https://celo-sepolia.blockscout.com",
    explorerName: "Celo Explorer",
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    contracts: {
      pool: "0x038803a40130734e6ab711489060ea55f05bb475",
      verifier: "0x0f86796c3f3254442debd0705a56bdd82c69f4a6",
      withdrawVerifier: "0xd850af48bddf6e568a994a870aa684b86bb5054f",
      stablecoin: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
    },
    poolTokenDecimals: 6,
    poolDenomination: BigInt(1_000_000),
    stablecoinSymbol: "USDC",
    stablecoinName: "USD Coin",
    extraTokens: [],
    deployBlock: BigInt(19901100),
  },
};

const DEFAULTS = DEPLOY_ENV === "development" ? DEV_DEFAULTS : PROD_DEFAULTS;

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
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
  return slug === "monad" ? MONAD_CHAIN_IDS.has(value) : CELO_CHAIN_IDS.has(value);
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

function getEnvAddress(name: string, fallback: `0x${string}`): `0x${string}` {
  const value = getEnv(name);
  return isAddress(value) ? value : fallback;
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

  const computedPlaceholder =
    !rpcUrl ||
    !explorerUrl ||
    stablecoin === ZERO_ADDR ||
    getEnvAddress(`${prefix}_POOL_ADDRESS`, defaults.contracts.pool) === ZERO_ADDR ||
    getEnvAddress(`${prefix}_VERIFIER_ADDRESS`, defaults.contracts.verifier) === ZERO_ADDR ||
    getEnvAddress(
      `${prefix}_WITHDRAW_VERIFIER_ADDRESS`,
      defaults.contracts.withdrawVerifier,
    ) === ZERO_ADDR ||
    getEnvBigInt(`${prefix}_DEPLOY_BLOCK`, defaults.deployBlock) <= BigInt(0);

  const placeholder =
    getEnvBoolean(`${prefix}_PLACEHOLDER`) ?? computedPlaceholder;

  const tokens =
    DEPLOY_ENV === "production"
      ? [defaultToken, ...defaults.extraTokens]
      : [defaultToken];

  return {
    id,
    name,
    slug,
    rpcUrl,
    explorerUrl,
    explorerName,
    nativeCurrency: defaults.nativeCurrency,
    contracts: {
      pool: getEnvAddress(`${prefix}_POOL_ADDRESS`, defaults.contracts.pool),
      verifier: getEnvAddress(`${prefix}_VERIFIER_ADDRESS`, defaults.contracts.verifier),
      withdrawVerifier: getEnvAddress(
        `${prefix}_WITHDRAW_VERIFIER_ADDRESS`,
        defaults.contracts.withdrawVerifier,
      ),
      stablecoin,
    },
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

if (monadChain.id === celoChain.id) {
  throw new Error("Monad and Celo chain IDs must be different");
}

export const CHAINS: Record<number, ChainConfig> = Object.freeze({
  [celoChain.id]: celoChain,
  [monadChain.id]: monadChain,
});

export const CHAIN_IDS = Object.freeze([celoChain.id, monadChain.id]);

const defaultChainSlug = getEnv("NEXT_PUBLIC_DEFAULT_CHAIN") as ChainSlug | undefined;

export const DEFAULT_CHAIN_ID =
  defaultChainSlug === "monad"
    ? monadChain.id
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
