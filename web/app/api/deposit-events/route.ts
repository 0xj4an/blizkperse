import { NextRequest, NextResponse } from "next/server";

// RPC scan can take a while on first run or with many blocks (e.g. Monad rate limits)
export const maxDuration = 60;

import { CHAINS, type SupportedChainId } from "@/lib/constants";
import { resolveAllowlistedPool } from "@/lib/pool-allowlist";
import { requireWalletAuth } from "@/lib/server-auth";
import { ensurePoolDepositCache } from "../../lib/rootRegistrar";

export async function GET(req: NextRequest) {
  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const chainIdParam = req.nextUrl.searchParams.get("chain_id");
  const poolParam = req.nextUrl.searchParams.get("pool_address");
  const tokenSymbol = req.nextUrl.searchParams.get("token_symbol");
  const chainId = Number(chainIdParam) as SupportedChainId;
  const config = CHAINS[chainId];

  if (!config || config.placeholder) {
    return NextResponse.json(
      { error: `Chain ${chainId} not supported or not deployed` },
      { status: 400 },
    );
  }

  const poolAddress = resolveAllowlistedPool(config, poolParam, tokenSymbol);
  if (!poolAddress) {
    return NextResponse.json(
      { error: "pool_address must be a configured pool for this chain" },
      { status: 400 },
    );
  }

  try {
    const { events } = await ensurePoolDepositCache({
      chainId,
      poolAddress,
      timeBudgetMs: 25_000,
    });
    return NextResponse.json(events);
  } catch (err) {
    console.error("deposit-events error:", err instanceof Error ? err.message : err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
