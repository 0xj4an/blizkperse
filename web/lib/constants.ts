export const SITE_NAME = "Blizkperse";
export const SITE_DESCRIPTION =
  "Private stablecoin payments on any chain";

// ── Token config ────────────────────────────────────────

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  address: `0x${string}` | null; // null = native token
  isNative: boolean;
}

// ── Chain config ────────────────────────────────────────

export type SupportedChainId = 143 | 42220;

export interface ChainConfig {
  id: SupportedChainId;
  name: string;
  slug: "monad" | "celo";
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
  /** true when contracts are not yet deployed */
  placeholder: boolean;
}

// ── Chain registry ──────────────────────────────────────

const MONAD_USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;
const CELO_CUSD = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

export const CHAINS: Record<SupportedChainId, ChainConfig> = {
  143: {
    id: 143,
    name: "Monad",
    slug: "monad",
    rpcUrl: "https://rpc3.monad.xyz",
    explorerUrl: "https://monadexplorer.com",
    explorerName: "Monad Explorer",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    contracts: {
      pool: "0x085BD9c0C568BE5093130E2359B00e46cb0800d1",
      verifier: "0xf7b2eC9EC33e34431F7f184458aE18Fa418271E3",
      withdrawVerifier: "0xA465f96F9a0541D7392c5A22bBA7bc5f23e88f7c",
      stablecoin: MONAD_USDC,
    },
    poolTokenDecimals: 6,
    poolDenomination: 1_000_000n,
    tokens: [
      { symbol: "MON", name: "Monad", decimals: 18, address: null, isNative: true },
      { symbol: "USDC", name: "USD Coin", decimals: 6, address: MONAD_USDC, isNative: false },
    ],
    defaultToken: { symbol: "MON", name: "Monad", decimals: 18, address: null, isNative: true },
    placeholder: false,
  },
  42220: {
    id: 42220,
    name: "Celo",
    slug: "celo",
    rpcUrl: "https://forno.celo.org",
    explorerUrl: "https://celoscan.io",
    explorerName: "CeloScan",
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    contracts: {
      pool: ZERO_ADDR,
      verifier: ZERO_ADDR,
      withdrawVerifier: ZERO_ADDR,
      stablecoin: CELO_CUSD,
    },
    poolTokenDecimals: 18,
    poolDenomination: 1_000_000_000_000_000_000n,
    tokens: [
      { symbol: "CELO", name: "Celo", decimals: 18, address: null, isNative: true },
      { symbol: "cUSD", name: "Celo Dollar", decimals: 18, address: CELO_CUSD, isNative: false },
    ],
    defaultToken: { symbol: "CELO", name: "Celo", decimals: 18, address: null, isNative: true },
    placeholder: true,
  },
};

export const DEFAULT_CHAIN_ID: SupportedChainId = 143;
export const CHAIN_IDS = Object.keys(CHAINS).map(Number) as SupportedChainId[];
