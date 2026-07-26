import { NextRequest, NextResponse } from "next/server";

// RPC scan can take a while on first run or with many blocks (e.g. Monad rate limits)
export const maxDuration = 60;

import { CHAINS, type SupportedChainId } from "@/lib/constants";
import { ensurePoolDepositCache } from "../../lib/rootRegistrar";

export async function GET(req: NextRequest) {
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

  const poolAddress = (poolParam as `0x${string}` | null)
    ?? (tokenSymbol && config.pools[tokenSymbol]?.pool)
    ?? config.contracts.pool;

  try {
    const { events } = await ensurePoolDepositCache({
      chainId,
      poolAddress: poolAddress as `0x${string}`,
      timeBudgetMs: 25_000,
    });
    return NextResponse.json(events);
  } catch (err) {
    console.error("deposit-events error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
