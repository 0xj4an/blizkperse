import sql from "@/lib/db";

/**
 * Promote a payout to `claimed` when every payment is finished
 * (claimed / failed / expired) and at least one was claimed.
 */
export async function markPayoutClaimedIfComplete(payoutId: string | null | undefined) {
  if (!payoutId) return;

  await sql`
    UPDATE payouts p
    SET status = 'claimed'
    WHERE p.id = ${payoutId}
      AND p.status IN ('deposited', 'distributed')
      AND EXISTS (
        SELECT 1 FROM payments pay
        WHERE pay.payout_id = p.id AND pay.status = 'claimed'
      )
      AND NOT EXISTS (
        SELECT 1 FROM payments pay
        WHERE pay.payout_id = p.id
          AND pay.status NOT IN ('claimed', 'failed', 'expired')
      )
  `;
}

/** Backfill: deposit/distributed payouts whose payments are all done. */
export async function syncFullyClaimedPayouts() {
  await sql`
    UPDATE payouts p
    SET status = 'claimed'
    WHERE p.status IN ('deposited', 'distributed')
      AND EXISTS (
        SELECT 1 FROM payments pay
        WHERE pay.payout_id = p.id AND pay.status = 'claimed'
      )
      AND NOT EXISTS (
        SELECT 1 FROM payments pay
        WHERE pay.payout_id = p.id
          AND pay.status NOT IN ('claimed', 'failed', 'expired')
      )
  `;
}
