import { NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { syncFullyClaimedPayouts } from "@/lib/payout-status";

export async function GET() {
  await ensureSchema();

  // Backfill payouts stuck on "deposited" after all payments were claimed.
  await syncFullyClaimedPayouts();

  const [organizers, subscribers, subscriptions, payouts, payments] =
    await Promise.all([
      sql`SELECT * FROM organizers`,
      sql`SELECT * FROM subscribers`,
      sql`SELECT * FROM subscriptions`,
      sql`SELECT * FROM payouts ORDER BY created_at DESC`,
      sql`
        SELECT p.*,
          n.chain_id AS chain_id,
          n.id AS note_id,
          n.deposit_tx AS deposit_tx,
          (
            (n.deposit_tx IS NOT NULL AND n.deposit_tx <> '')
            OR EXISTS (
              SELECT 1
              FROM deposit_events_cache d
              WHERE d.chain_id = n.chain_id
                AND lower(d.commitment) = lower(n.commitment)
                AND (
                  n.pool_address IS NULL
                  OR n.pool_address = ''
                  OR lower(d.pool_address) = lower(n.pool_address)
                )
            )
          ) AS deposit_confirmed
        FROM payments p
        LEFT JOIN LATERAL (
          SELECT id, chain_id, commitment, pool_address, deposit_tx
          FROM notes
          WHERE payment_id = p.id
          ORDER BY created_at DESC
          LIMIT 1
        ) n ON true
      `,
    ]);

  return NextResponse.json({
    organizers,
    subscribers,
    subscriptions,
    payouts,
    payments,
  });
}
