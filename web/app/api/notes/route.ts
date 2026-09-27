import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";
import { CHAINS, DEFAULT_CHAIN_ID, type SupportedChainId } from "@/lib/constants";
import { verifyDepositOnChain } from "@/lib/chain-verify";

function enrichNoteRow(row: Record<string, unknown>) {
  const denom =
    row.denomination_id === null || row.denomination_id === undefined
      ? null
      : Number(row.denomination_id);
  // Note-level mode: denomination_id is source of truth (Auto Mix has both kinds).
  const notePrivacy =
    denom !== null && Number.isInteger(denom) ? "private" : "standard";
  const payoutPrivacy =
    row.privacy_mode === "private"
      ? "private"
      : row.privacy_mode === "auto"
        ? "auto"
        : "standard";
  return {
    ...row,
    denomination_id: denom,
    privacy_mode: notePrivacy,
    payout_privacy_mode: payoutPrivacy,
  };
}

export async function GET(req: NextRequest) {
  await ensureSchema();

  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const paymentId = req.nextUrl.searchParams.get("payment_id");
  const subscriberId = req.nextUrl.searchParams.get("subscriber_id");

  if (!paymentId && !subscriberId) {
    return NextResponse.json(
      { error: "payment_id or subscriber_id is required" },
      { status: 400 },
    );
  }

  if (paymentId) {
    const [payment] = await sql`
      SELECT s.address
      FROM payments p
      JOIN subscribers s ON s.id = p.subscriber_id
      WHERE p.id = ${paymentId}
    `;
    if (!payment) {
      return NextResponse.json([], { status: 200 });
    }
    if (String(payment.address).toLowerCase() !== auth.address) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (subscriberId) {
    const [subscriber] = await sql`
      SELECT address FROM subscribers WHERE id = ${subscriberId}
    `;
    if (!subscriber) {
      return NextResponse.json([], { status: 200 });
    }
    if (String(subscriber.address).toLowerCase() !== auth.address) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Join payout so claim can see privacy_mode even when denomination_id is null
  // (surface a clear error instead of silently using Standard withdraw).
  const notes = paymentId
    ? await sql`
        SELECT n.*, COALESCE(po.privacy_mode, 'standard') AS privacy_mode
        FROM notes n
        JOIN payments pay ON pay.id = n.payment_id
        LEFT JOIN payouts po ON po.id = pay.payout_id
        WHERE n.payment_id = ${paymentId}
      `
    : subscriberId
      ? await sql`
          SELECT n.*, COALESCE(po.privacy_mode, 'standard') AS privacy_mode
          FROM notes n
          JOIN payments pay ON pay.id = n.payment_id
          LEFT JOIN payouts po ON po.id = pay.payout_id
          WHERE n.subscriber_id = ${subscriberId}
          ORDER BY n.created_at ASC
        `
      : await sql`SELECT n.*, 'standard'::text AS privacy_mode FROM notes n`;

  return NextResponse.json(notes.map((n) => enrichNoteRow(n as Record<string, unknown>)));
}

export async function POST(req: NextRequest) {
  await ensureSchema();

  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const {
    payment_id,
    subscriber_id,
    chain_id,
    commitment,
    value,
    holder_pk,
    randomness,
    nullifier,
    token_symbol,
    pool_address,
    deposit_tx,
    denomination_id,
  } = await req.json();

  if (!payment_id) {
    return NextResponse.json({ error: "payment_id is required" }, { status: 400 });
  }
  if (!commitment || !value || !holder_pk || !randomness || !nullifier) {
    return NextResponse.json(
      { error: "commitment, value, holder_pk, randomness, and nullifier are required" },
      { status: 400 },
    );
  }
  if (!deposit_tx || typeof deposit_tx !== "string") {
    return NextResponse.json(
      { error: "deposit_tx is required (confirmed on-chain deposit hash)" },
      { status: 400 },
    );
  }

  const normalizedChainId = Number(chain_id ?? DEFAULT_CHAIN_ID) as SupportedChainId;
  if (!CHAINS[normalizedChainId]) {
    return NextResponse.json({ error: "Unsupported chain_id" }, { status: 400 });
  }

  const [payment] = await sql`
    SELECT
      p.id,
      p.subscriber_id,
      o.owner_address,
      COALESCE(po.privacy_mode, 'standard') AS privacy_mode
    FROM payments p
    JOIN organizers o ON o.id = p.organizer_id
    LEFT JOIN payouts po ON po.id = p.payout_id
    WHERE p.id = ${payment_id}
  `;
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (String(payment.owner_address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (subscriber_id && subscriber_id !== payment.subscriber_id) {
    return NextResponse.json(
      { error: "subscriber_id does not match payment" },
      { status: 400 },
    );
  }

  const privacyModeRaw = String(payment.privacy_mode ?? "standard");
  const privacyMode =
    privacyModeRaw === "private"
      ? "private"
      : privacyModeRaw === "auto"
        ? "auto"
        : "standard";

  const poolForSync =
    (typeof pool_address === "string" && pool_address.startsWith("0x")
      ? (pool_address as `0x${string}`)
      : null) ??
    (token_symbol ? CHAINS[normalizedChainId]?.pools[token_symbol]?.pool : null) ??
    CHAINS[normalizedChainId]?.contracts.pool;

  // Refuse to register claimable notes until the Deposit / CommitmentInserted is confirmed.
  let verified: Awaited<ReturnType<typeof verifyDepositOnChain>>;
  try {
    verified = await verifyDepositOnChain({
      chainId: normalizedChainId,
      commitment: String(commitment),
      depositTx: String(deposit_tx),
      poolAddress: poolForSync,
      tokenSymbol: token_symbol ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `On-chain deposit not confirmed: ${msg}` },
      { status: 400 },
    );
  }

  // Index immediately so claim Merkle builds do not depend on a full historical rescan.
  try {
    const { cacheVerifiedDeposit } = await import("../../lib/rootRegistrar");
    await cacheVerifiedDeposit({
      chainId: normalizedChainId,
      poolAddress: verified.poolAddress,
      commitment: String(commitment),
      blockNumber: verified.blockNumber,
    });
  } catch (err) {
    console.error("post-deposit cache insert failed:", err);
  }

  let denomId =
    denomination_id === null || denomination_id === undefined
      ? null
      : Number(denomination_id);

  // Recover denomination_id from CommitmentInserted when localStorage flush omitted it.
  if (
    denomId === null &&
    verified.denominationId !== undefined &&
    Number.isInteger(verified.denominationId)
  ) {
    denomId = verified.denominationId;
  }

  // Pure Standard payouts must not carry a bucket id.
  if (privacyMode === "standard") {
    denomId = null;
  }

  if (
    denomId !== null &&
    (!Number.isInteger(denomId) || denomId < 0 || denomId > 63)
  ) {
    return NextResponse.json(
      { error: "denomination_id must be an integer 0..63 or null" },
      { status: 400 },
    );
  }

  // Pure Private requires denomination_id. Auto Mix allows null (Standard remainder notes).
  if (privacyMode === "private" && denomId === null) {
    return NextResponse.json(
      {
        error:
          "Private payout notes require denomination_id (or a CommitmentInserted event on deposit_tx). Re-flush pending secrets after a Private depositBatch.",
      },
      { status: 400 },
    );
  }

  const [row] = await sql`
    INSERT INTO notes (
      payment_id, subscriber_id, chain_id, commitment, value, holder_pk,
      randomness, nullifier, token_symbol, pool_address, deposit_tx, denomination_id
    )
    VALUES (
      ${payment.id}, ${payment.subscriber_id}, ${normalizedChainId}, ${commitment},
      ${value}, ${holder_pk}, ${randomness}, ${nullifier},
      ${token_symbol ?? null}, ${verified.poolAddress}, ${deposit_tx}, ${denomId}
    )
    ON CONFLICT (payment_id) DO UPDATE SET
      subscriber_id = EXCLUDED.subscriber_id,
      chain_id = EXCLUDED.chain_id,
      commitment = EXCLUDED.commitment,
      value = EXCLUDED.value,
      holder_pk = EXCLUDED.holder_pk,
      randomness = EXCLUDED.randomness,
      nullifier = EXCLUDED.nullifier,
      token_symbol = EXCLUDED.token_symbol,
      pool_address = EXCLUDED.pool_address,
      deposit_tx = EXCLUDED.deposit_tx,
      denomination_id = EXCLUDED.denomination_id
    RETURNING *
  `;

  // Only after verified Deposit — mark claimable (and revive failed rows from prior save bugs).
  await sql`
    UPDATE payments
    SET status = 'claimable'
    WHERE id = ${payment.id} AND status IN ('pending', 'failed')
  `;

  // After-the-fact recovery (flush from localStorage): payout often stays `pending`
  // because createPayout intentionally skips finalize when notes POST failed.
  // Must promote pending → deposited (not only failed), or UI stays "Awaiting deposit".
  const [payoutMeta] = await sql`
    SELECT p.id, p.status, p.organizer_id, p.tx_hash
    FROM payouts p
    JOIN payments pay ON pay.payout_id = p.id
    WHERE pay.id = ${payment.id}
  `;

  if (payoutMeta) {
    const [sumRow] = await sql`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM payments
      WHERE payout_id = ${payoutMeta.id}
        AND status IN ('claimable', 'claimed')
    `;
    const depositedTotal = Number(sumRow.total);
    const prevStatus = String(payoutMeta.status);
    const nextTx =
      (typeof payoutMeta.tx_hash === "string" && payoutMeta.tx_hash) ||
      String(deposit_tx);

    await sql`
      UPDATE payouts
      SET status = 'deposited',
          tx_hash = ${nextTx},
          total_amount = ${depositedTotal}
      WHERE id = ${payoutMeta.id}
        AND status IN ('pending', 'failed')
    `;

    // If already deposited (partial multi-note), still refresh totals / tx.
    if (prevStatus === "deposited") {
      await sql`
        UPDATE payouts
        SET total_amount = ${depositedTotal},
            tx_hash = COALESCE(NULLIF(tx_hash, ''), ${String(deposit_tx)})
        WHERE id = ${payoutMeta.id}
      `;
    } else if (prevStatus === "pending" || prevStatus === "failed") {
      await sql`
        UPDATE organizers
        SET total_distributed = total_distributed + ${depositedTotal}
        WHERE id = ${payoutMeta.organizer_id}
      `;
    }
  }

  if (poolForSync && poolForSync !== "0x0000000000000000000000000000000000000000") {
    void import("../../lib/rootRegistrar")
      .then(({ syncPoolRoot }) =>
        syncPoolRoot({
          chainId: normalizedChainId,
          poolAddress: poolForSync as `0x${string}`,
        }),
      )
      .catch((err) => {
        console.error("post-deposit root sync failed:", err);
      });
  }

  return NextResponse.json(
    enrichNoteRow({ ...row, privacy_mode: privacyMode } as Record<string, unknown>),
    { status: 201 },
  );
}
