import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";

export async function GET(req: NextRequest) {
  await ensureSchema();

  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const [row] = await sql`
    SELECT * FROM subscribers WHERE address = ${address.toLowerCase()}
  `;

  if (!row) {
    return NextResponse.json(null, { status: 404 });
  }

  return NextResponse.json(row);
}

export async function POST(req: NextRequest) {
  await ensureSchema();

  const { address, name, email } = await req.json();

  const [row] = await sql`
    INSERT INTO subscribers (address, name, email)
    VALUES (${address.toLowerCase()}, ${name}, ${email ?? null})
    ON CONFLICT (address) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, subscribers.name)
    RETURNING *
  `;

  return NextResponse.json(row, { status: 201 });
}
