export const AUTH_ADDRESS_HEADER = "x-blizk-address";
export const AUTH_SIGNATURE_HEADER = "x-blizk-signature";
export const AUTH_TIMESTAMP_HEADER = "x-blizk-ts";

/** Server rejects wallet auth signatures older than this. */
export const AUTH_TTL_MS = 5 * 60 * 1000;

export function buildWalletAuthMessage(address: string, timestamp: string) {
  return [
    "Blizkperse API Authentication",
    `address:${address.toLowerCase()}`,
    `timestamp:${timestamp}`,
  ].join("\n");
}
