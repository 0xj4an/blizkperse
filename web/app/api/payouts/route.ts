import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const { organizer_id, total_amount, token, tx_hash, recipients, status } = await req.json();

  const [organizer] = await sql`
    SELECT owner_address FROM organizers WHERE id = ${organizer_id}
  `;
  if (!organizer) {
    return NextResponse.json({ error: "Organizer not found" }, { status: 404 });
  }
  if (String(organizer.owner_address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // insert payout
  const [payout] = await sql`
    INSERT INTO payouts (organizer_id, total_amount, token, status, tx_hash)
    VALUES (${organizer_id}, ${total_amount}, ${token ?? 'USDC'}, ${status ?? 'pending'}, ${tx_hash ?? null})
    RETURNING *
  `;

  const payments = [];
  for (const r of recipients as Array<{ subscriber_id: string; amount: number }>) {
    const [payment] = await sql`
      INSERT INTO payments (payout_id, organizer_id, subscriber_id, amount, status)
      VALUES (${payout.id}, ${organizer_id}, ${r.subscriber_id}, ${r.amount}, 'pending')
      RETURNING *
    `;
    payments.push(payment);
  }

  return NextResponse.json({ payout, payments }, { status: 201 });
}
