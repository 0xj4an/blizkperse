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
      sql`SELECT * FROM payments`,
    ]);

  return NextResponse.json({
    organizers,
    subscribers,
    subscriptions,
    payouts,
    payments,
  });
}
