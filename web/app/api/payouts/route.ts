import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  await ensureSchema();

  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const {
    organizer_id,
    total_amount,
    token,
    tx_hash,
    recipients,
    status,
    privacy_mode,
  } = await req.json();

  const privacyMode =
    privacy_mode === "private" ? "private" : "standard";

  const [organizer] = await sql`
    SELECT owner_address, private_enabled FROM organizers WHERE id = ${organizer_id}
  `;
  if (!organizer) {
    return NextResponse.json({ error: "Organizer not found" }, { status: 404 });
  }
  if (String(organizer.owner_address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (privacyMode === "private" && !organizer.private_enabled) {
    return NextResponse.json(
      {
        error:
          "Private mode is not enabled for this organization. Enable it in the payer dashboard first.",
      },
      { status: 403 },
    );
  }

  const [payout] = await sql`
    INSERT INTO payouts (organizer_id, total_amount, token, status, tx_hash, privacy_mode)
    VALUES (
      ${organizer_id},
      ${total_amount},
      ${token ?? "USDC"},
      ${status ?? "pending"},
      ${tx_hash ?? null},
      ${privacyMode}
    )
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
