import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name } = await req.json();

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [row] = await sql`
    UPDATE organizers SET name = ${name.trim()} WHERE id = ${id} RETURNING *
  `;

  if (!row) {
    return NextResponse.json({ error: "Organizer not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Guard: block delete if any payment is not yet claimed
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM payments
    WHERE organizer_id = ${id} AND status != 'claimed'
  `;

  if (count > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${count} unclaimed payment(s) remain` },
      { status: 409 }
    );
  }

  const [row] = await sql`
    DELETE FROM organizers WHERE id = ${id} RETURNING id
  `;

  if (!row) {
    return NextResponse.json({ error: "Organizer not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
