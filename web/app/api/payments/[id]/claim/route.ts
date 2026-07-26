import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";
import { verifyClaimOnChain } from "@/lib/chain-verify";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureSchema();

  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const tx_hash = typeof body?.tx_hash === "string" ? body.tx_hash : null;

  const [payment] = await sql`
    SELECT
      p.id,
      p.status,
      s.address,
      n.nullifier,
      n.chain_id,
      n.pool_address,
      n.token_symbol
    FROM payments p
    JOIN subscribers s ON s.id = p.subscriber_id
    LEFT JOIN notes n ON n.payment_id = p.id
    WHERE p.id = ${id}
  `;
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (String(payment.address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (payment.status === "claimed") {
    const [existing] = await sql`SELECT * FROM payments WHERE id = ${id}`;
    return NextResponse.json(existing);
  }

  if (!payment.nullifier || payment.chain_id == null) {
    return NextResponse.json(
      { error: "No note linked to this payment; cannot verify claim on-chain" },
      { status: 400 },
    );
  }

  try {
    await verifyClaimOnChain({
      chainId: Number(payment.chain_id),
      nullifier: String(payment.nullifier),
      txHash: tx_hash,
      poolAddress: payment.pool_address ? String(payment.pool_address) : null,
      tokenSymbol: payment.token_symbol ? String(payment.token_symbol) : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `On-chain claim not confirmed: ${msg}` },
      { status: 400 },
    );
  }

  const [row] = await sql`
    UPDATE payments
    SET status = 'claimed', claimed_at = NOW(), tx_hash = COALESCE(${tx_hash}, tx_hash)
    WHERE id = ${id}
    RETURNING *
  `;

  if (!row) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}
