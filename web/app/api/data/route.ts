import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";
import { syncFullyClaimedPayouts } from "@/lib/payout-status-db";

/**
 * Scoped bootstrap for the connected wallet.
 * Never returns global tables — only orgs you own, your subscriber row,
 * and related subscriptions / payouts / payments.
 */
export async function GET(req: NextRequest) {
  await ensureSchema();

  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const addr = auth.address.toLowerCase();

  // Backfill payouts stuck on "deposited" after all payments were claimed.
  await syncFullyClaimedPayouts();

  const [organizers, subscribers, subscriptions, payouts, payments] =
    await Promise.all([
      sql`
        SELECT * FROM organizers
        WHERE lower(owner_address) = ${addr}
      `,
      sql`
        SELECT DISTINCT s.*
        FROM subscribers s
        WHERE lower(s.address) = ${addr}
           OR EXISTS (
             SELECT 1
             FROM subscriptions sub
             JOIN organizers o ON o.id = sub.organizer_id
             WHERE sub.subscriber_id = s.id
               AND lower(o.owner_address) = ${addr}
           )
           OR EXISTS (
             SELECT 1
             FROM payments pay
             JOIN organizers o ON o.id = pay.organizer_id
             WHERE pay.subscriber_id = s.id
               AND lower(o.owner_address) = ${addr}
           )
      `,
      sql`
        SELECT sub.*
        FROM subscriptions sub
        JOIN organizers o ON o.id = sub.organizer_id
        LEFT JOIN subscribers s ON s.id = sub.subscriber_id
        WHERE lower(o.owner_address) = ${addr}
           OR lower(s.address) = ${addr}
      `,
      sql`
        SELECT p.*
        FROM (
          SELECT DISTINCT p.*
          FROM payouts p
          JOIN organizers o ON o.id = p.organizer_id
          WHERE lower(o.owner_address) = ${addr}
          UNION
          SELECT DISTINCT p.*
          FROM payouts p
          JOIN payments pay ON pay.payout_id = p.id
          JOIN subscribers s ON s.id = pay.subscriber_id
          WHERE lower(s.address) = ${addr}
        ) p
        ORDER BY p.created_at DESC
      `,
      sql`
        SELECT pay.*,
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
        FROM payments pay
        JOIN organizers o ON o.id = pay.organizer_id
        LEFT JOIN subscribers s ON s.id = pay.subscriber_id
        LEFT JOIN LATERAL (
          SELECT id, chain_id, commitment, pool_address, deposit_tx
          FROM notes
          WHERE payment_id = pay.id
          ORDER BY created_at DESC
          LIMIT 1
        ) n ON true
        WHERE lower(o.owner_address) = ${addr}
           OR lower(s.address) = ${addr}
      `,
    ]);

  // Redact emails for subscribers that are not the caller (payer still sees
  // names/addresses of their own recipients; emails stay private to self).
  const scrubbedSubscribers = subscribers.map((row) => {
    const r = row as Record<string, unknown>;
    if (String(r.address ?? "").toLowerCase() === addr) return r;
    return { ...r, email: null };
  });

  return NextResponse.json({
    organizers,
    subscribers: scrubbedSubscribers,
    subscriptions,
    payouts,
    payments,
  });
}
