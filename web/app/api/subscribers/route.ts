import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  await ensureSchema();

  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  if (address.toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await sql`
    SELECT * FROM subscribers WHERE address = ${address.toLowerCase()}
  `;

  if (!row) {
    // Missing subscriber is a valid onboarding state, not an API error.
    return NextResponse.json(null);
  }

  return NextResponse.json(row);
}

export async function POST(req: NextRequest) {
  await ensureSchema();

  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const { address, name, email } = await req.json();
  if (String(address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await sql`
    INSERT INTO subscribers (address, name, email)
    VALUES (${address.toLowerCase()}, ${name}, ${email ?? null})
    ON CONFLICT (address) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, subscribers.name)
    RETURNING *
  `;

  return NextResponse.json(row, { status: 201 });
}
