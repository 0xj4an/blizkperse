import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";
import { verifyClaimOnChain } from "@/lib/chain-verify";
import { markPayoutClaimedIfComplete } from "@/lib/payout-status";

/**
 * Reconcile the caller's claimable payments against on-chain nullifiers.
 * Marks claimed when the nullifier is already spent (DB lagged behind the chain).
 */
export async function POST(req: NextRequest) {
  await ensureSchema();

  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const [subscriber] = await sql`
    SELECT id FROM subscribers WHERE lower(address) = ${auth.address}
  `;
  if (!subscriber) {
    return NextResponse.json({ reconciled: 0, claimed: [] });
  }

  const rows = await sql`
    SELECT
      p.id,
      p.payout_id,
      n.nullifier,
      n.chain_id,
      n.pool_address,
      n.token_symbol,
      p.tx_hash
    FROM payments p
    JOIN notes n ON n.payment_id = p.id
    WHERE p.subscriber_id = ${subscriber.id}
      AND p.status = 'claimable'
  `;

  const claimed: string[] = [];
  const payoutIds = new Set<string>();
  for (const row of rows) {
    if (!row.nullifier || row.chain_id == null) continue;
    try {
      await verifyClaimOnChain({
        chainId: Number(row.chain_id),
        nullifier: String(row.nullifier),
        txHash: row.tx_hash ? String(row.tx_hash) : null,
        poolAddress: row.pool_address ? String(row.pool_address) : null,
        tokenSymbol: row.token_symbol ? String(row.token_symbol) : null,
      });
      await sql`
        UPDATE payments
        SET status = 'claimed',
            claimed_at = COALESCE(claimed_at, NOW())
        WHERE id = ${row.id} AND status = 'claimable'
      `;
      claimed.push(String(row.id));
      if (row.payout_id) payoutIds.add(String(row.payout_id));
    } catch {
      // Still unclaimed on-chain — leave as claimable.
    }
  }

  for (const payoutId of payoutIds) {
    await markPayoutClaimedIfComplete(payoutId);
  }

  return NextResponse.json({ reconciled: claimed.length, claimed });
}
