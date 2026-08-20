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
