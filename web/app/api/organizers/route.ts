import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const { name, owner_address } = await req.json();

  const [row] = await sql`
    INSERT INTO organizers (name, owner_address)
    VALUES (${name}, ${owner_address})
    RETURNING *
  `;

  return NextResponse.json(row, { status: 201 });
}
