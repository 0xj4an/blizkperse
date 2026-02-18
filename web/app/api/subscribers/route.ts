import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
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
