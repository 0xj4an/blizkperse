import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

const MAX_USES_MIN = 1;
const MAX_USES_MAX = 1000;

function generateInviteCode() {
  return randomBytes(18).toString("base64url");
}

function clampMaxUses(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return MAX_USES_MIN;
  return Math.min(MAX_USES_MAX, Math.max(MAX_USES_MIN, Math.floor(n)));
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const organizerId = typeof body.organizer_id === "string" ? body.organizer_id : "";
  if (!organizerId) {
    return NextResponse.json({ error: "organizer_id is required" }, { status: 400 });
  }

  const maxUses = clampMaxUses(body.max_uses ?? 1);

  const [organizer] = await sql`
    SELECT id, owner_address FROM organizers WHERE id = ${organizerId}
  `;
  if (!organizer) {
    return NextResponse.json({ error: "Organizer not found" }, { status: 404 });
  }
  if (String(organizer.owner_address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const code = generateInviteCode();
  const [row] = await sql`
    INSERT INTO org_invites (organizer_id, code, created_by, max_uses)
    VALUES (${organizerId}, ${code}, ${auth.address}, ${maxUses})
    RETURNING *
  `;

  const joinPath = `/receive?invite=${encodeURIComponent(row.code)}`;
  return NextResponse.json(
    {
      ...row,
      max_uses: Number(row.max_uses),
      use_count: Number(row.use_count),
      join_path: joinPath,
    },
    { status: 201 },
  );
}
