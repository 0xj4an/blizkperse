export const AUTH_ADDRESS_HEADER = "x-blizk-address";
export const AUTH_SIGNATURE_HEADER = "x-blizk-signature";
export const AUTH_TIMESTAMP_HEADER = "x-blizk-ts";

export function buildWalletAuthMessage(address: string, timestamp: string) {
  return [
    "Blizkperse API Authentication",
    `address:${address.toLowerCase()}`,
    `timestamp:${timestamp}`,
  ].join("\n");
}
