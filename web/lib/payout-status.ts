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

export type PayoutLikeStatus =
  | "pending"
  | "deposited"
  | "distributed"
  | "claimed"
  | "failed";

export type PaymentLikeStatus =
  | "pending"
  | "claimable"
  | "claimed"
  | "expired"
  | "failed";

/** Derive display status from child payments (UI / local store). */
export function effectivePayoutStatus(
  payoutStatus: PayoutLikeStatus,
  paymentStatuses: PaymentLikeStatus[],
): PayoutLikeStatus {
  if (paymentStatuses.length === 0) return payoutStatus;
  if (payoutStatus === "failed" || payoutStatus === "pending") return payoutStatus;

  const anyClaimed = paymentStatuses.some((s) => s === "claimed");
  const allDone = paymentStatuses.every(
    (s) => s === "claimed" || s === "failed" || s === "expired",
  );
  if (anyClaimed && allDone) return "claimed";
  return payoutStatus;
}
