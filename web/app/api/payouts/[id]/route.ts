import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { tx_hash, status } = await req.json();

  const [payout] = await sql`
    SELECT p.id, p.status, p.total_amount, p.organizer_id, o.owner_address
    FROM payouts p
    JOIN organizers o ON o.id = p.organizer_id
    WHERE p.id = ${id}
  `;

  if (!payout) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }

  if (String(payout.owner_address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const nextStatus = status ?? "deposited";

  const [row] = await sql`
    UPDATE payouts
    SET status = ${nextStatus}, tx_hash = ${tx_hash ?? null}
    WHERE id = ${id}
    RETURNING *
  `;

  if (nextStatus === "deposited" && payout.status !== "deposited") {
    await sql`
      UPDATE payments
      SET status = 'claimable'
      WHERE payout_id = ${id} AND status = 'pending'
    `;
    await sql`
      UPDATE organizers
      SET total_distributed = total_distributed + ${payout.total_amount}
      WHERE id = ${payout.organizer_id}
    `;
  }

  return NextResponse.json(row);
}
