import type { ChainConfig } from "@/lib/constants";

const ZERO = "0x0000000000000000000000000000000000000000";

/** True when `pool` is a configured ShieldedPool for this chain (not arbitrary hex). */
export function isKnownPoolAddress(
  config: ChainConfig,
  pool: string | null | undefined,
): pool is `0x${string}` {
  if (!pool || !/^0x[0-9a-fA-F]{40}$/.test(pool)) return false;
  const lower = pool.toLowerCase();
  if (lower === ZERO) return false;
  if (config.contracts.pool?.toLowerCase() === lower) return true;
  return Object.values(config.pools).some(
    (p) => p.pool?.toLowerCase() === lower && p.pool.toLowerCase() !== ZERO,
  );
}

/** Resolve a pool from params only if it is allowlisted for the chain. */
export function resolveAllowlistedPool(
  config: ChainConfig,
  poolParam?: string | null,
  tokenSymbol?: string | null,
): `0x${string}` | null {
  if (poolParam && isKnownPoolAddress(config, poolParam)) {
    return poolParam.toLowerCase() as `0x${string}`;
  }
  if (tokenSymbol && config.pools[tokenSymbol]?.pool) {
    const p = config.pools[tokenSymbol].pool;
    if (isKnownPoolAddress(config, p)) return p.toLowerCase() as `0x${string}`;
  }
  if (isKnownPoolAddress(config, config.contracts.pool)) {
    return config.contracts.pool.toLowerCase() as `0x${string}`;
  }
  return null;
}
