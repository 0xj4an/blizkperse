import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const tx_hash = body?.tx_hash ?? null;

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
