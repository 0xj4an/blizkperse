import { NextRequest, NextResponse } from "next/server";
import sql, { ensureSchema } from "@/lib/db";
import { requireWalletAuth } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  await ensureSchema();
  const auth = await requireWalletAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const subscriberId =
    typeof body.subscriber_id === "string" ? body.subscriber_id : "";
  const inviteCode =
    typeof body.invite_code === "string" ? body.invite_code.trim() : "";

  if (!subscriberId) {
    return NextResponse.json({ error: "subscriber_id is required" }, { status: 400 });
  }
  if (!inviteCode) {
    return NextResponse.json(
      { error: "invite_code is required" },
      { status: 400 },
    );
  }

  const [subscriber] = await sql`
    SELECT address FROM subscribers WHERE id = ${subscriberId}
  `;
  if (!subscriber) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
  }
  if (String(subscriber.address).toLowerCase() !== auth.address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const row = await sql.begin(async (tx) => {
      const [existingSub] = await tx`
        SELECT s.id, s.organizer_id, s.subscriber_id, s.status, s.created_at
        FROM subscriptions s
        JOIN org_invites i ON i.organizer_id = s.organizer_id
        WHERE i.code = ${inviteCode}
          AND s.subscriber_id = ${subscriberId}
      `;
      if (existingSub) {
        const err = new Error("Already subscribed to this organization") as Error & {
          status?: number;
        };
        err.status = 409;
        throw err;
      }

      const [invite] = await tx`
        UPDATE org_invites
        SET
          use_count = use_count + 1,
          used_at = COALESCE(used_at, now()),
          used_by_subscriber_id = COALESCE(used_by_subscriber_id, ${subscriberId})
        WHERE code = ${inviteCode}
          AND use_count < max_uses
          AND (expires_at IS NULL OR expires_at > now())
        RETURNING *
      `;

      if (!invite) {
        const [lookup] = await tx`
          SELECT use_count, max_uses, expires_at FROM org_invites WHERE code = ${inviteCode}
        `;
        const err = new Error(
          !lookup
            ? "Invalid invite code"
            : Number(lookup.use_count) >= Number(lookup.max_uses)
              ? "Invite fully used"
              : "Invite code expired",
        ) as Error & { status?: number };
        err.status = 400;
        throw err;
      }

      await tx`
        INSERT INTO org_invite_redemptions (invite_id, subscriber_id)
        VALUES (${invite.id}, ${subscriberId})
      `;

      const [subscription] = await tx`
        INSERT INTO subscriptions (organizer_id, subscriber_id, status)
        VALUES (${invite.organizer_id}, ${subscriberId}, 'active')
        RETURNING *
      `;

      await tx`
        UPDATE organizers
        SET subscriber_count = subscriber_count + 1
        WHERE id = ${invite.organizer_id}
      `;

      return subscription;
    });

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status?: number }).status)
        : 0;
    if (status >= 400 && status < 600) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to join" },
        { status },
      );
    }

    const message = err instanceof Error ? err.message : "";
    // Unique(organizer_id, subscriber_id) race — invite claim rolled back with the txn.
    if (message.includes("subscriptions_organizer_id_subscriber_id_key")) {
      return NextResponse.json(
        { error: "Already subscribed to this organization" },
        { status: 409 },
      );
    }
    // Unique(invite_id, subscriber_id) on redemptions — same subscriber double-redeem race.
    if (message.includes("org_invite_redemptions_pkey")) {
      return NextResponse.json(
        { error: "Already subscribed to this organization" },
        { status: 409 },
      );
    }

    console.error("Failed to redeem invite / create subscription:", err);
    return NextResponse.json({ error: "Failed to join" }, { status: 500 });
  }
}
