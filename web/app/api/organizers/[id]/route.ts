import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { name } = await req.json();

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [organizer] = await sql`
    SELECT owner_address FROM organizers WHERE id = ${id}
  `;
  if (!organizer) {
    return NextResponse.json({ error: "Organizer not found" }, { status: 404 });
  }
  if (String(organizer.owner_address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const [organizer] = await sql`
    SELECT owner_address FROM organizers WHERE id = ${id}
  `;
  if (!organizer) {
    return NextResponse.json({ error: "Organizer not found" }, { status: 404 });
  }
  if (String(organizer.owner_address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
