"use client";

import type { WalletClient, Hex } from "viem";
import {
  AUTH_ADDRESS_HEADER,
  AUTH_SIGNATURE_HEADER,
  AUTH_TIMESTAMP_HEADER,
  buildWalletAuthMessage,
} from "./auth-shared";

const AUTH_TTL_MS = 5 * 60 * 1000;

type CachedAuth = {
  address: string;
  expiresAt: number;
  headers: Record<string, string>;
};

let cachedAuth: CachedAuth | null = null;

export async function getWalletAuthHeaders(
  walletClient: WalletClient | null | undefined,
  address: string | null | undefined,
): Promise<Record<string, string>> {
  if (!walletClient || !address) {
    throw new Error("Wallet authentication is required");
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
  const signature = await walletClient.signMessage({
    account: address as Hex,
    message,
  });

  const headers = {
    [AUTH_ADDRESS_HEADER]: normalizedAddress,
    [AUTH_SIGNATURE_HEADER]: signature,
    [AUTH_TIMESTAMP_HEADER]: timestamp,
  };

  cachedAuth = {
    address: normalizedAddress,
    expiresAt: now + AUTH_TTL_MS,
    headers,
  };

  return headers;
}

export function createWalletAuthHeadersGetter(
  walletClient: WalletClient | null | undefined,
  address: string | null | undefined,
) {
  return async () => getWalletAuthHeaders(walletClient, address);
}
