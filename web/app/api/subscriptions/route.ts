import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const { organizer_id, subscriber_id } = await req.json();

  const [subscriber] = await sql`
    SELECT address FROM subscribers WHERE id = ${subscriber_id}
  `;
  if (!subscriber) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
  }
  if (String(subscriber.address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await sql`
    INSERT INTO subscriptions (organizer_id, subscriber_id, status)
    VALUES (${organizer_id}, ${subscriber_id}, 'active')
    RETURNING *
  `;

  // increment subscriber_count
  await sql`
    UPDATE organizers
    SET subscriber_count = subscriber_count + 1
    WHERE id = ${organizer_id}
  `;

  return NextResponse.json(row, { status: 201 });
}
