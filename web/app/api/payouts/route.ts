import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const { organizer_id, total_amount, token, tx_hash, recipients } = await req.json();

  // insert payout
  const [payout] = await sql`
    INSERT INTO payouts (organizer_id, total_amount, token, status, tx_hash)
    VALUES (${organizer_id}, ${total_amount}, ${token ?? 'USDC'}, 'deposited', ${tx_hash})
    RETURNING *
  `;

  // batch insert payments
  const payments = await sql`
    INSERT INTO payments ${sql(
      recipients.map((r: { subscriber_id: string; amount: number }) => ({
        payout_id: payout.id,
        organizer_id,
        subscriber_id: r.subscriber_id,
        amount: r.amount,
        status: "claimable",
      }))
    )}
    RETURNING *
  `;

  // update organizer total
  await sql`
    UPDATE organizers
    SET total_distributed = total_distributed + ${total_amount}
    WHERE id = ${organizer_id}
  `;

  return NextResponse.json({ payout, payments }, { status: 201 });
}
