import { NextRequest, NextResponse } from "next/server";
import { CHAINS, type SupportedChainId } from "@/lib/constants";
import { requireWalletAuth } from "@/lib/server-auth";
import { syncPoolRoot } from "../../lib/rootRegistrar";

export const maxDuration = 60;

function authorizedBySecret(req: NextRequest): boolean {
  const secret = process.env.ROOT_REGISTRAR_API_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? req.headers.get("x-api-key") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : header;
  return bearer === secret;
}

/**
 * Rebuild + register Merkle tip for a pool.
 * Auth: ROOT_REGISTRAR_API_SECRET (cron) OR wallet auth (post-deposit / claim fallback).
 */
export async function POST(req: NextRequest) {
  const bySecret = authorizedBySecret(req);
  if (!bySecret) {
    const auth = await requireWalletAuth(req);
    if ("error" in auth) return auth.error;
  }

  let body: {
    chain_id?: number;
    pool_address?: string;
    token_symbol?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const chainId = Number(body.chain_id) as SupportedChainId;
  const config = CHAINS[chainId];
  if (!config || config.placeholder) {
    return NextResponse.json({ error: "Unsupported or undeployed chain" }, { status: 400 });
  }

  const poolAddress = (body.pool_address as `0x${string}` | undefined)
    ?? (body.token_symbol ? config.pools[body.token_symbol]?.pool : undefined)
    ?? config.contracts.pool;

  if (!poolAddress || poolAddress === "0x0000000000000000000000000000000000000000") {
    return NextResponse.json({ error: "pool_address required" }, { status: 400 });
  }

  try {
    const result = await syncPoolRoot({
      chainId,
      poolAddress: poolAddress as `0x${string}`,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("sync-pool-root error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
