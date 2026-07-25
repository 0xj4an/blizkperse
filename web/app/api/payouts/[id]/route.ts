import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

const FINALIZABLE = new Set(["pending", "failed"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureSchema();

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

  let nextStatus: string = status ?? "deposited";

  // Never mark the whole payout failed if some notes already landed on-chain.
  if (nextStatus === "failed") {
    const [withNotes] = await sql`
      SELECT count(*)::int AS c
      FROM payments p
      JOIN notes n ON n.payment_id = p.id
      WHERE p.payout_id = ${id}
    `;
    if (Number(withNotes.c) > 0) {
      nextStatus = "deposited";
    }
  }

  if (nextStatus === "failed") {
    await sql`
      UPDATE payments
      SET status = 'failed'
      WHERE payout_id = ${id} AND status = 'pending'
    `;

    const [row] = await sql`
      UPDATE payouts
      SET status = 'failed', tx_hash = ${tx_hash ?? null}
      WHERE id = ${id}
      RETURNING *
    `;
    return NextResponse.json(row);
  }

  if (nextStatus === "deposited") {
    // Drop unfinished recipients; keep deposited notes claimable.
    await sql`
      UPDATE payments
      SET status = 'failed'
      WHERE payout_id = ${id}
        AND status = 'pending'
        AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.payment_id = payments.id)
    `;
    await sql`
      UPDATE payments
      SET status = 'claimable'
      WHERE payout_id = ${id}
        AND status = 'pending'
        AND EXISTS (SELECT 1 FROM notes n WHERE n.payment_id = payments.id)
    `;

    const [sumRow] = await sql`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM payments
      WHERE payout_id = ${id} AND status IN ('claimable', 'claimed')
    `;
    const depositedTotal = Number(sumRow.total);

    const [row] = await sql`
      UPDATE payouts
      SET status = 'deposited',
          tx_hash = ${tx_hash ?? null},
          total_amount = ${depositedTotal}
      WHERE id = ${id}
      RETURNING *
    `;

    // Only credit organizer once when leaving a non-deposited state.
    if (FINALIZABLE.has(String(payout.status))) {
      await sql`
        UPDATE organizers
        SET total_distributed = total_distributed + ${depositedTotal}
        WHERE id = ${payout.organizer_id}
      `;
    }

    return NextResponse.json(row);
  }

  const [row] = await sql`
    UPDATE payouts
    SET status = ${nextStatus}, tx_hash = ${tx_hash ?? null}
    WHERE id = ${id}
    RETURNING *
  `;

  return NextResponse.json(row);
}
