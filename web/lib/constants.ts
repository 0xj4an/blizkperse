export const SITE_NAME = "Blizkperse";
export const SITE_DESCRIPTION =
  "Painless crypto payments on Monad";
export const MONAD_CHAIN_ID = 143;
export const MONAD_RPC_URL = "https://rpc3.monad.xyz";
// Deployed contracts (Monad Mainnet — Chain 143)
export const VERIFIER_ADDRESS = "0xf7b2eC9EC33e34431F7f184458aE18Fa418271E3" as const;
export const WITHDRAW_VERIFIER_ADDRESS = "0xA465f96F9a0541D7392c5A22bBA7bc5f23e88f7c" as const;
export const POOL_ADDRESS = "0x085BD9c0C568BE5093130E2359B00e46cb0800d1" as const;
export const USDC_ADDRESS = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;

// The ShieldedPool was deployed with USDC as its token
export const POOL_TOKEN_ADDRESS = USDC_ADDRESS;
export const POOL_TOKEN_DECIMALS = 6;
export const POOL_DENOMINATION = 1_000_000n; // 1 USDC = 1e6

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
