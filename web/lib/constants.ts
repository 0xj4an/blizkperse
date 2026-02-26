export const SITE_NAME = "Blizkperse";
export const SITE_DESCRIPTION =
  "Private stablecoin payments on any chain";

// ── Token config ────────────────────────────────────────

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  address: `0x${string}`;
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
  /** Block number the pool contract was deployed at (for event scanning) */
  deployBlock: bigint;
  /** true when contracts are not yet deployed */
  placeholder: boolean;
}

// ── Token addresses ────────────────────────────────────

// Monad (143)
const MONAD_USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;
const MONAD_USDT = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D" as const;

// Celo (42220) — Circle & Tether
const CELO_USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;
const CELO_USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as const;

// Celo (42220) — Mento stablecoins (rebranded 2025)
const CELO_USDm = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const;
const CELO_EURm = "0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73" as const;
const CELO_BRLm = "0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787" as const;
const CELO_GBPm = "0xCCF663b1fF11028f0b19058d0f7B674004a40746" as const;
const CELO_JPYm = "0xc45eCF20f3CD864B32D9794d6f76814aE8892e20" as const;
const CELO_CHFm = "0xb55a79F398E759E43C95b979163f30eC87Ee131D" as const;
const CELO_AUDm = "0x7175504C455076F15c04A2F90a8e352281F492F9" as const;
const CELO_CADm = "0xff4Ab19391af240c311c54200a492233052B6325" as const;
const CELO_KESm = "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0" as const;
const CELO_PHPm = "0x105d4A9306D2E55a71d2Eb95B81553AE1dC20d7B" as const;
const CELO_COPm = "0x8A567e2aE79CA692Bd748aB832081C45de4041eA" as const;
const CELO_NGNm = "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71" as const;
const CELO_XOFm = "0x73F93dcc49cB8A239e2032663e9475dd5ef29A08" as const;
const CELO_ZARm = "0x4c35853A3B4e647fD266f4de678dCc8fEC410BF6" as const;
const CELO_GHSm = "0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313" as const;

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

// ── Shared token definitions ───────────────────────────

const MONAD_USDC_TOKEN: TokenConfig = { symbol: "USDC", name: "USD Coin", decimals: 6, address: MONAD_USDC };
const MONAD_USDT_TOKEN: TokenConfig = { symbol: "USDT", name: "Tether USD", decimals: 6, address: MONAD_USDT };

const CELO_USDC_TOKEN: TokenConfig = { symbol: "USDC", name: "USD Coin", decimals: 6, address: CELO_USDC };
const CELO_USDT_TOKEN: TokenConfig = { symbol: "USDT", name: "Tether USD", decimals: 6, address: CELO_USDT };

// ── Chain registry ──────────────────────────────────────

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
      pool: "0x1aBee1E0205BB4E6d0b95a2C1F5072d9f3064778",
      verifier: "0x3D76FC7Ce515aB1d69A4e734354c6EC94c22CCb9",
      withdrawVerifier: "0x6e4794166dE8Af43D1720f66bA39f561F2C0eD95",
      stablecoin: MONAD_USDC,
    },
    poolTokenDecimals: 6,
    poolDenomination: BigInt(1_000_000),
    tokens: [MONAD_USDC_TOKEN, MONAD_USDT_TOKEN],
    defaultToken: MONAD_USDC_TOKEN,
    deployBlock: BigInt(57_841_520),
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
      stablecoin: CELO_USDm,
    },
    poolTokenDecimals: 18,
    poolDenomination: BigInt(1_000_000_000_000_000_000),
    tokens: [
      // Circle & Tether
      CELO_USDC_TOKEN,
      CELO_USDT_TOKEN,
      // Mento stablecoins (rebranded 2025)
      { symbol: "USDm", name: "Mento Dollar", decimals: 18, address: CELO_USDm },
      { symbol: "EURm", name: "Mento Euro", decimals: 18, address: CELO_EURm },
      { symbol: "BRLm", name: "Mento Real", decimals: 18, address: CELO_BRLm },
      { symbol: "GBPm", name: "Mento Pound", decimals: 18, address: CELO_GBPm },
      { symbol: "JPYm", name: "Mento Yen", decimals: 18, address: CELO_JPYm },
      { symbol: "CHFm", name: "Mento Franc", decimals: 18, address: CELO_CHFm },
      { symbol: "AUDm", name: "Mento AUD", decimals: 18, address: CELO_AUDm },
      { symbol: "CADm", name: "Mento CAD", decimals: 18, address: CELO_CADm },
      { symbol: "KESm", name: "Mento Shilling", decimals: 18, address: CELO_KESm },
      { symbol: "PHPm", name: "Mento Peso (PH)", decimals: 18, address: CELO_PHPm },
      { symbol: "COPm", name: "Mento Peso (CO)", decimals: 18, address: CELO_COPm },
      { symbol: "NGNm", name: "Mento Naira", decimals: 18, address: CELO_NGNm },
      { symbol: "XOFm", name: "Mento CFA", decimals: 18, address: CELO_XOFm },
      { symbol: "ZARm", name: "Mento Rand", decimals: 18, address: CELO_ZARm },
      { symbol: "GHSm", name: "Mento Cedi", decimals: 18, address: CELO_GHSm },
    ],
    defaultToken: CELO_USDC_TOKEN,
    deployBlock: BigInt(0),
    placeholder: true,
  },
};

export const DEFAULT_CHAIN_ID: SupportedChainId = 42220;
export const CHAIN_IDS = Object.keys(CHAINS).map(Number) as SupportedChainId[];
