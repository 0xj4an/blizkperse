import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";
import { CHAINS, DEFAULT_CHAIN_ID, type SupportedChainId } from "@/lib/constants";
import { verifyDepositOnChain } from "@/lib/chain-verify";

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

  const notes = paymentId
    ? await sql`SELECT * FROM notes WHERE payment_id = ${paymentId}`
    : subscriberId
      ? await sql`
          SELECT * FROM notes
          WHERE subscriber_id = ${subscriberId}
          ORDER BY created_at ASC
        `
      : await sql`SELECT * FROM notes`;

  return NextResponse.json(notes);
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
    SELECT p.id, p.subscriber_id, o.owner_address
    FROM payments p
    JOIN organizers o ON o.id = p.organizer_id
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

  const poolForSync =
    (typeof pool_address === "string" && pool_address.startsWith("0x")
      ? (pool_address as `0x${string}`)
      : null) ??
    (token_symbol ? CHAINS[normalizedChainId]?.pools[token_symbol]?.pool : null) ??
    CHAINS[normalizedChainId]?.contracts.pool;

  // Refuse to register claimable notes until the Deposit is confirmed on-chain.
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

  const [row] = await sql`
    INSERT INTO notes (
      payment_id, subscriber_id, chain_id, commitment, value, holder_pk,
      randomness, nullifier, token_symbol, pool_address, deposit_tx
    )
    VALUES (
      ${payment.id}, ${payment.subscriber_id}, ${normalizedChainId}, ${commitment},
      ${value}, ${holder_pk}, ${randomness}, ${nullifier},
      ${token_symbol ?? null}, ${pool_address ?? null}, ${deposit_tx}
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
      deposit_tx = EXCLUDED.deposit_tx
    RETURNING *
  `;

  // Only after verified Deposit — mark claimable (and revive failed rows from prior save bugs).
  await sql`
    UPDATE payments
    SET status = 'claimable'
    WHERE id = ${payment.id} AND status IN ('pending', 'failed')
  `;

  await sql`
    UPDATE payouts
    SET status = 'deposited'
    WHERE id = (
      SELECT payout_id FROM payments WHERE id = ${payment.id}
    )
    AND status = 'failed'
  `;

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

  return NextResponse.json(row, { status: 201 });
}
