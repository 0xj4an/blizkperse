import {
  celoMainnet,
  celoSepolia,
  defineAlchemyChain,
  monadMainnet,
  monadTestnet,
} from "@account-kit/infra";
import { defineChain, type Chain } from "viem";
import { ChainId, type ChainConfig } from "./constants";

/**
 * Alchemy AA (Account Kit / Gas Manager) coverage:
 * - Presets in `@account-kit/infra`: Celo mainnet/Sepolia + Monad mainnet/testnet.
 * - Robinhood (4663 / 46630): not a preset yet (aa-sdk PR #2505 still open), but Para
 *   `@getpara/aa-alchemy` accepts any chain with `rpcUrls.alchemy` via
 *   `defineAlchemyChain` — see `ensureAlchemyChain` in aa-alchemy.
 * - On-chain RH: EntryPoint v0.6 + Modular Account v1 factory/impl are deployed
 *   (Para `mode: "4337"` → `createModularAccountAlchemyClient` / EP v0.6).
 *
 * Para `mode: "4337"` uses Modular Account → EntryPoint **v0.6**
 * (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`). That is expected, not a bug.
 *
 * Gas Manager checklist (avoids `Policy ID(s) not found`):
 * 1. `NEXT_PUBLIC_ALCHEMY_API_KEY` and `NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID` belong to the **same** Alchemy app.
 * 2. Policy status is **Active**.
 * 3. Policy networks include the claim chain (e.g. **Celo 42220**, **Robinhood 4663**).
 * 4. Policy allows EntryPoint v0.6 for Modular Account sponsorship.
 */

/** RH not in `@account-kit/infra` yet — wire Alchemy RPC via `defineAlchemyChain`. */
const robinhoodMainnet = defineAlchemyChain({
  chain: defineChain({
    id: 4663,
    name: "Robinhood Mainnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: ["https://robinhood-mainnet.g.alchemy.com/v2"] },
      public: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
    },
    blockExplorers: {
      default: {
        name: "Robinhood Chain Explorer",
        url: "https://robinhoodchain.blockscout.com",
      },
    },
  }),
  rpcBaseUrl: "https://robinhood-mainnet.g.alchemy.com/v2",
});

const robinhoodTestnet = defineAlchemyChain({
  chain: defineChain({
    id: 46630,
    name: "Robinhood Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: ["https://robinhood-testnet.g.alchemy.com/v2"] },
      public: { http: ["https://rpc.testnet.chain.robinhood.com"] },
    },
    blockExplorers: {
      default: {
        name: "Robinhood Chain Testnet Explorer",
        url: "https://explorer.testnet.chain.robinhood.com",
      },
    },
    testnet: true,
  }),
  rpcBaseUrl: "https://robinhood-testnet.g.alchemy.com/v2",
});


export const ALCHEMY_API_KEY =
  process.env.NEXT_PUBLIC_ALCHEMY_API_KEY?.trim() || "";

/** Optional — empty means smart account can still be created, but txs are not gas-sponsored. */
export const ALCHEMY_GAS_POLICY_ID =
  process.env.NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID?.trim() || "";

export function isAlchemyConfigured(): boolean {
  return Boolean(ALCHEMY_API_KEY);
}

export function isGasSponsorshipConfigured(): boolean {
  return Boolean(ALCHEMY_API_KEY && ALCHEMY_GAS_POLICY_ID);
}

const ALCHEMY_CHAIN_BY_ID: Record<number, Chain> = {
  [ChainId.CELO]: celoMainnet,
  [ChainId.CELO_TESTNET]: celoSepolia,
  [ChainId.MONAD]: monadMainnet,
  [ChainId.MONAD_TESTNET]: monadTestnet,
  [ChainId.ROBINHOOD]: robinhoodMainnet,
  [ChainId.ROBINHOOD_TESTNET]: robinhoodTestnet,
};

/** Map app ChainConfig → Alchemy Account Kit chain (required by `@getpara/aa-alchemy`). */
export function getAlchemyChain(config: ChainConfig): Chain | null {
  return ALCHEMY_CHAIN_BY_ID[config.id] ?? null;
}

const ALCHEMY_SPONSORSHIP_USER_MESSAGE =
  "Oops, we are out of funds! Sponsored transaction failed — please try again later.";

function errorToRawString(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current != null && depth < 6; depth++) {
    if (typeof current === "string") {
      parts.push(current);
      break;
    }
    if (current instanceof Error) {
      parts.push(current.message);
      const extended = current as Error & { shortMessage?: string; details?: string };
      if (extended.shortMessage) parts.push(extended.shortMessage);
      if (extended.details) parts.push(extended.details);
      current = (current as Error & { cause?: unknown }).cause;
      continue;
    }
    try {
      parts.push(JSON.stringify(current));
    } catch {
      parts.push(String(current));
    }
    break;
  }
  return parts.filter(Boolean).join(" | ") || String(err);
}

/**
 * Turn Alchemy / Para AA paymaster failures into short user-facing English copy.
 * Returns null when the error is unrelated to Gas Manager / sponsorship.
 * Detailed reason is logged for developers only (no Policy ID in the UI).
 */
export function formatAlchemyPaymasterError(err: unknown): string | null {
  const raw = errorToRawString(err);
  const lower = raw.toLowerCase();
  const isPaymaster =
    lower.includes("policy id") ||
    lower.includes("requestgasandpaymaster") ||
    lower.includes("gas manager") ||
    lower.includes("paymaster") ||
    lower.includes("sponsorship") ||
    (lower.includes("useroperation") && lower.includes("insufficient")) ||
    (lower.includes("policy") && lower.includes("not found"));
  if (!isPaymaster) return null;

  console.warn("[alchemy] Gas Manager / sponsorship error:", raw, {
    policyIdConfigured: Boolean(ALCHEMY_GAS_POLICY_ID),
  });

  return ALCHEMY_SPONSORSHIP_USER_MESSAGE;
}

export type InsufficientGasAction = "deposit" | "claim";

/**
 * Map viem/RPC insufficient-native-balance (gas) errors to short English UI copy.
 * Covers Celo ("insufficient funds"), Monad/viem ("Signer had insufficient balance"),
 * InsufficientFundsError / estimateGas, and related RPC shapes.
 * Does not match our preflight token shortfall messages
 * ("Insufficient USDC balance…") — those are thrown before the wallet send.
 * Returns null when the error is unrelated.
 */
export function formatInsufficientGasError(
  err: unknown,
  action: InsufficientGasAction = "deposit",
): string | null {
  const raw = errorToRawString(err);
  const lower = raw.toLowerCase();

  // Our own ERC-20 preflight copy — never rewrite as a gas message.
  if (
    /insufficient \w+ balance:/.test(lower) ||
    lower.includes("gross required") ||
    lower.includes("notes (net)")
  ) {
    return null;
  }

  const isInsufficientGas =
    lower.includes("signer had insufficient balance") ||
    lower.includes("insufficient funds") ||
    lower.includes("insufficientfunds") ||
    lower.includes("insufficient balance") ||
    lower.includes("gas * price + value") ||
    lower.includes("gas * gas price + value") ||
    lower.includes("gas * gas fee + value") ||
    lower.includes("exceeds the balance");
  if (!isInsufficientGas) return null;

  console.warn(`[${action}] Insufficient native balance for gas:`, raw);
  return `You don't have enough gas to complete this ${action}.`;
}
