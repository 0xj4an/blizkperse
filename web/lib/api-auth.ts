"use client";

import { useMemo } from "react";
import { hexStringToBase64 } from "@getpara/core-sdk";
import { useAccount, useSignMessage } from "@getpara/react-sdk";
import { hashMessage, parseSignature, serializeSignature, type Hex } from "viem";
import type { WalletClient } from "viem";
import {
  AUTH_ADDRESS_HEADER,
  AUTH_SIGNATURE_HEADER,
  AUTH_TIMESTAMP_HEADER,
  AUTH_TTL_MS,
  buildWalletAuthMessage,
} from "./auth-shared";
import { useParaWalletClient } from "./wallet";

/** Re-export for callers that previously imported from this module. */
export { AUTH_TTL_MS };

/**
 * Client must refresh *before* the server TTL. Using the same 5m window caused
 * POST /api/notes to send a near-expiry cached signature after proving+deposit,
 * yielding 401 and losing note secrets after a successful on-chain deposit.
 */
const AUTH_CACHE_TTL_MS = Math.floor(AUTH_TTL_MS * 0.75);

export type ParaSignMessageResult =
  | { signature: string }
  | { pendingTransactionId: string; transactionReviewUrl?: string };

export type ParaSignMessageFn = (args: {
  walletId: string;
  messageBase64: string;
}) => Promise<ParaSignMessageResult>;

export type WalletAuth = {
  walletClient?: WalletClient | null;
  address?: string | null;
  walletId?: string | null;
  signMessageAsync?: ParaSignMessageFn | null;
};

type CachedAuth = {
  address: string;
  expiresAt: number;
  headers: Record<string, string>;
};

let cachedAuth: CachedAuth | null = null;

/** Drop cached wallet auth headers (e.g. after a 401 from the API). */
export function clearWalletAuthCache() {
  cachedAuth = null;
}

function normalizeParaSignature(rawSignature: string): `0x${string}` {
  const sigHex = rawSignature.startsWith("0x")
    ? (rawSignature as `0x${string}`)
    : (`0x${rawSignature}` as `0x${string}`);
  const parsed = parseSignature(sigHex);
  return serializeSignature({
    r: parsed.r,
    s: parsed.s,
    yParity: parsed.yParity,
  });
}

export async function getWalletAuthHeaders(
  auth: WalletAuth,
): Promise<Record<string, string>> {
  const { walletClient, address, walletId, signMessageAsync } = auth;
  if (!walletClient || !address) {
    if (!signMessageAsync || !walletId || !address) {
      throw new Error("Wallet authentication is required");
    }
  }

  const normalizedAddress = address.toLowerCase();
  const now = Date.now();

  if (
    cachedAuth &&
    cachedAuth.address === normalizedAddress &&
    cachedAuth.expiresAt > now
  ) {
    return cachedAuth.headers;
  }

  const timestamp = String(now);
  const message = buildWalletAuthMessage(normalizedAddress, timestamp);
  let signature: `0x${string}`;

  // Use Para SDK's native signing if available to avoid sending personal_sign to RPCs that reject it
  if (signMessageAsync && walletId) {
    const hashed = hashMessage(message);
    const signatureRes = await signMessageAsync({
      walletId,
      messageBase64: hexStringToBase64(hashed),
    });
    const rawSignature =
      signatureRes && "signature" in signatureRes
        ? (signatureRes as { signature: string }).signature
        : undefined;
    if (!rawSignature) {
      throw new Error("Wallet signature requires additional confirmation");
    }
    signature = normalizeParaSignature(rawSignature);
  } else if (walletClient) {
    // Fallback to viem for non-embedded or external wallets
    signature = await walletClient.signMessage({
      account: address as Hex,
      message,
    });
  } else {
    throw new Error("Cannot sign message: no wallet client and no embedded wallet");
  }

  const headers = {
    [AUTH_ADDRESS_HEADER]: normalizedAddress,
    [AUTH_SIGNATURE_HEADER]: signature,
    [AUTH_TIMESTAMP_HEADER]: timestamp,
  };

  cachedAuth = {
    address: normalizedAddress,
    expiresAt: now + AUTH_CACHE_TTL_MS,
    headers,
  };

  return headers;
}

export function createWalletAuthHeadersGetter(auth: WalletAuth) {
  return async () => getWalletAuthHeaders(auth);
}

export function useApiAuth(): WalletAuth {
  const { embedded } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { walletClient, address: walletAddress } = useParaWalletClient();
  const embeddedWallet = embedded?.wallets?.[0];

  return useMemo(
    () => ({
      walletClient,
      address: walletAddress ?? embeddedWallet?.address ?? null,
      walletId: embeddedWallet?.id ?? null,
      signMessageAsync,
    }),
    [walletClient, walletAddress, embeddedWallet?.address, embeddedWallet?.id, signMessageAsync],
  );
}
