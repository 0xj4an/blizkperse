import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchema();

  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const { name, private_enabled } = body as {
    name?: string;
    private_enabled?: boolean;
  };

  const [organizer] = await sql`
    SELECT owner_address FROM organizers WHERE id = ${id}
  `;
  if (!organizer) {
    return NextResponse.json({ error: "Organizer not found" }, { status: 404 });
  }
  if (String(organizer.owner_address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (name !== undefined) {
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
  }

  if (private_enabled !== undefined && typeof private_enabled !== "boolean") {
    return NextResponse.json(
      { error: "private_enabled must be a boolean" },
      { status: 400 },
    );
  }

  if (name === undefined && private_enabled === undefined) {
    return NextResponse.json(
      { error: "Provide name and/or private_enabled" },
      { status: 400 },
    );
  }

  let row;
  if (name !== undefined && private_enabled !== undefined) {
    [row] = await sql`
      UPDATE organizers
      SET name = ${name.trim()}, private_enabled = ${private_enabled}
      WHERE id = ${id}
      RETURNING *
    `;
  } else if (name !== undefined) {
    [row] = await sql`
      UPDATE organizers SET name = ${name.trim()} WHERE id = ${id} RETURNING *
    `;
  } else {
    [row] = await sql`
      UPDATE organizers
      SET private_enabled = ${private_enabled!}
      WHERE id = ${id}
      RETURNING *
    `;
  }

  if (!row) {
    return NextResponse.json({ error: "Organizer not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchema();

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
