import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";
import { CHAINS, type SupportedChainId } from "@/lib/constants";

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
  } = await req.json();

  if (!payment_id) {
    return NextResponse.json({ error: "payment_id is required" }, { status: 400 });
  }

  const normalizedChainId = Number(chain_id ?? 143) as SupportedChainId;
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

  const [row] = await sql`
    INSERT INTO notes (payment_id, subscriber_id, chain_id, commitment, value, holder_pk, randomness, nullifier)
    VALUES (${payment.id}, ${payment.subscriber_id}, ${normalizedChainId}, ${commitment}, ${value}, ${holder_pk}, ${randomness}, ${nullifier})
    ON CONFLICT (payment_id) DO UPDATE SET
      subscriber_id = EXCLUDED.subscriber_id,
      chain_id = EXCLUDED.chain_id,
      commitment = EXCLUDED.commitment,
      value = EXCLUDED.value,
      holder_pk = EXCLUDED.holder_pk,
      randomness = EXCLUDED.randomness,
      nullifier = EXCLUDED.nullifier
    RETURNING *
  `;

  return NextResponse.json(row, { status: 201 });
}
