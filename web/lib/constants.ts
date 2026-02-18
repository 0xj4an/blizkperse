export const SITE_NAME = "Blizkperse";
export const SITE_DESCRIPTION =
  "Painless crypto payments on Monad";
export const MONAD_CHAIN_ID = 143;
export const MONAD_RPC_URL = "https://rpc3.monad.xyz";
export const USDM_DECIMALS = 6;
export const USDM_SYMBOL = "USDm";

// Deployed contracts (Monad Mainnet)
export const VERIFIER_ADDRESS = "0xc300285105b376b9e0CF7Ed78EC42b74d9c3d060" as const;
export const POOL_ADDRESS = "0xD850AF48bDdf6E568A994a870aA684B86Bb5054f" as const;
export const USDM_ADDRESS = "0x754704bc059f8c67012fed69bc8a327a5aafb603" as const;
export const USDC_ADDRESS = "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea" as const;

// Supported tokens for payouts
export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  address: `0x${string}` | null; // null = native token (MON)
  isNative: boolean;
}

export const SUPPORTED_TOKENS: TokenConfig[] = [
  { symbol: "MON", name: "Monad", decimals: 18, address: null, isNative: true },
  { symbol: "USDC", name: "USD Coin", decimals: 6, address: USDC_ADDRESS, isNative: false },
];

export const DEFAULT_TOKEN = SUPPORTED_TOKENS[0]; // MON
