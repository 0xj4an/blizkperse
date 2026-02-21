import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";

export async function GET(req: NextRequest) {
  await ensureSchema();

  const paymentId = req.nextUrl.searchParams.get("payment_id");
  const subscriberId = req.nextUrl.searchParams.get("subscriber_id");

  const notes = paymentId
    ? await sql`SELECT * FROM notes WHERE payment_id = ${paymentId}`
    : subscriberId
      ? await sql`
          SELECT n.* FROM notes n
          JOIN payments p ON p.id = n.payment_id
          WHERE p.subscriber_id = ${subscriberId}
        `
      : await sql`SELECT * FROM notes`;

  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  await ensureSchema();

  const { subscriber_id, chain_id, commitment, value, holder_pk, randomness, nullifier } =
    await req.json();

  // Find the most recent claimable payment for this subscriber
  const [payment] = await sql`
    SELECT id FROM payments
    WHERE subscriber_id = ${subscriber_id} AND status = 'claimable'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const [row] = await sql`
    INSERT INTO notes (payment_id, chain_id, commitment, value, holder_pk, randomness, nullifier)
    VALUES (${payment?.id ?? null}, ${chain_id ?? 143}, ${commitment}, ${value}, ${holder_pk}, ${randomness}, ${nullifier})
    RETURNING *
  `;

  return NextResponse.json(row, { status: 201 });
}
