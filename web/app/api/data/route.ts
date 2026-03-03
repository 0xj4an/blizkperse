import { NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";

export async function GET() {
  await ensureSchema();

  const [organizers, subscribers, subscriptions, payouts, payments] =
    await Promise.all([
      sql`SELECT * FROM organizers`,
      sql`SELECT * FROM subscribers`,
      sql`SELECT * FROM subscriptions`,
      sql`SELECT * FROM payouts ORDER BY created_at DESC`,
      // Include chain_id and note id from the payment's note for filtering and UI
      sql`
        SELECT p.*,
          (SELECT n.chain_id FROM notes n WHERE n.payment_id = p.id ORDER BY n.created_at DESC LIMIT 1) AS chain_id,
          (SELECT n.id FROM notes n WHERE n.payment_id = p.id ORDER BY n.created_at DESC LIMIT 1) AS note_id
        FROM payments p
      `,
    ]);

  return NextResponse.json({
    organizers,
    subscribers,
    subscriptions,
    payouts,
    payments,
  });
}
