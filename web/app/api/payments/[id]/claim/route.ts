import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const tx_hash = body?.tx_hash ?? null;

  const [payment] = await sql`
    SELECT s.address
    FROM payments p
    JOIN subscribers s ON s.id = p.subscriber_id
    WHERE p.id = ${id}
  `;
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (String(payment.address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await sql`
    UPDATE payments
    SET status = 'claimed', claimed_at = NOW(), tx_hash = ${tx_hash}
    WHERE id = ${id}
    RETURNING *
  `;

  if (!row) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}
