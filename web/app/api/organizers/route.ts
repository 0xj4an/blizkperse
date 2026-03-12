import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const { name, owner_address } = await req.json();
  if (String(owner_address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await sql`
    INSERT INTO organizers (name, owner_address)
    VALUES (${name}, ${owner_address})
    RETURNING *
  `;

  return NextResponse.json(row, { status: 201 });
}
