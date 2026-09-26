import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

/**
 * Audit / viewing pack for selective disclosure (institutional v0).
 * Omits note randomness and holder secrets by default.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureSchema();

  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const [payout] = await sql`
    SELECT
      p.*,
      o.name AS organizer_name,
      o.owner_address
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

  const rows = await sql`
    SELECT
      pay.id AS payment_id,
      pay.subscriber_id,
      s.name AS subscriber_name,
      s.address AS subscriber_address,
      pay.amount,
      pay.status AS payment_status,
      pay.claimed_at,
      pay.tx_hash AS claim_tx,
      n.id AS note_id,
      n.chain_id,
      n.commitment,
      n.nullifier,
      n.value AS note_value,
      n.token_symbol,
      n.pool_address,
      n.deposit_tx,
      n.created_at AS note_created_at
    FROM payments pay
    LEFT JOIN subscribers s ON s.id = pay.subscriber_id
    LEFT JOIN notes n ON n.payment_id = pay.id
    WHERE pay.payout_id = ${id}
    ORDER BY pay.created_at ASC
  `;

  const pack = {
    version: 1 as const,
    exported_at: new Date().toISOString(),
    exporter: auth.address,
    payout: {
      id: payout.id,
      organizer_id: payout.organizer_id,
      organizer_name: payout.organizer_name,
      total_amount: Number(payout.total_amount),
      token: payout.token,
      status: payout.status,
      privacy_mode: payout.privacy_mode ?? "standard",
      tx_hash: payout.tx_hash,
      created_at: payout.created_at,
    },
    notes: rows.map((r) => ({
      payment_id: r.payment_id,
      subscriber_id: r.subscriber_id,
      // Names/addresses for auditor context; redact offline if needed.
      subscriber_name: r.subscriber_name,
      subscriber_address: r.subscriber_address,
      amount: Number(r.amount),
      payment_status: r.payment_status,
      claimed_at: r.claimed_at,
      claim_tx: r.claim_tx,
      note_id: r.note_id,
      chain_id: r.chain_id != null ? Number(r.chain_id) : null,
      commitment: r.commitment,
      nullifier: r.nullifier,
      note_value: r.note_value,
      token_symbol: r.token_symbol,
      pool_address: r.pool_address,
      deposit_tx: r.deposit_tx,
      note_created_at: r.note_created_at,
    })),
  };

  const canonical = JSON.stringify(pack);
  const payload_hash = createHash("sha256").update(canonical).digest("hex");

  return NextResponse.json({
    ...pack,
    payload_hash: `sha256:${payload_hash}`,
    disclosure:
      "Audit pack for authorized reviewers. Does not include note randomness or spending keys. Share only under your compliance policy.",
  });
}
