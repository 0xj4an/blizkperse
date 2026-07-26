import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  await ensureSchema();
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
  }

  const [row] = await sql`
    SELECT
      i.id,
      i.code,
      i.organizer_id,
      i.used_at,
      i.expires_at,
      i.max_uses,
      i.use_count,
      o.name AS organizer_name
    FROM org_invites i
    JOIN organizers o ON o.id = i.organizer_id
    WHERE i.code = ${code}
  `;

  if (!row) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  const maxUses = Number(row.max_uses);
  const useCount = Number(row.use_count);
  const remaining = Math.max(0, maxUses - useCount);
  const exhausted = useCount >= maxUses;
  const expired =
    row.expires_at != null && new Date(row.expires_at as string).getTime() <= Date.now();

  return NextResponse.json({
    code: row.code,
    organizer_id: row.organizer_id,
    organizer_name: row.organizer_name,
    max_uses: maxUses,
    use_count: useCount,
    remaining,
    used: exhausted,
    expired,
    valid: !exhausted && !expired,
  });
}
