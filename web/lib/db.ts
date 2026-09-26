import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
const appEnv =
  process.env.BLIZ_ENV === "development" ||
  process.env.NEXT_PUBLIC_BLIZ_ENV === "development"
    ? "development"
    : "production";
// Must include every chain the app can deposit on. Missing ids make
// POST /api/notes fail AFTER on-chain Deposit (cache may land, note INSERT not).
const validNoteChainIds =
  appEnv === "development"
    ? [10143, 11142220, 4663, 46630] // monad/celo testnets + Robinhood (mainnet deploy used in RH envs)
    : [143, 42220, 4663, 46630];
const validNoteChainIdsSql = validNoteChainIds.join(", ");

if (!connectionString) {
  console.warn("DATABASE_URL not set - API routes will fail");
}

const sql = postgres(connectionString ?? "", {
  ssl: connectionString?.includes("railway") ? "require" : false,
  max: 10,
  idle_timeout: 20,
});

// Auto-create tables on first API call
let schemaReady: Promise<void> | null = null;

export function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS organizers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        owner_address text NOT NULL,
        total_distributed numeric DEFAULT 0,
        subscriber_count integer DEFAULT 0,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`ALTER TABLE organizers ADD COLUMN IF NOT EXISTS private_enabled boolean NOT NULL DEFAULT false`;
    await sql`
      CREATE TABLE IF NOT EXISTS subscribers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        address text UNIQUE NOT NULL,
        name text NOT NULL,
        email text,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizer_id uuid REFERENCES organizers(id) ON DELETE CASCADE,
        subscriber_id uuid REFERENCES subscribers(id) ON DELETE CASCADE,
        status text DEFAULT 'active' CHECK (status IN ('active', 'pending')),
        created_at timestamptz DEFAULT now(),
        UNIQUE(organizer_id, subscriber_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS org_invites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizer_id uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
        code text NOT NULL UNIQUE,
        created_by text NOT NULL,
        created_at timestamptz DEFAULT now(),
        used_at timestamptz,
        used_by_subscriber_id uuid REFERENCES subscribers(id) ON DELETE SET NULL,
        expires_at timestamptz,
        max_uses int NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
        use_count int NOT NULL DEFAULT 0 CHECK (use_count >= 0)
      )
    `;
    // Multi-redeem invites: migrate existing DBs that predate max_uses / use_count
    await sql`ALTER TABLE org_invites ADD COLUMN IF NOT EXISTS max_uses int`;
    await sql`ALTER TABLE org_invites ADD COLUMN IF NOT EXISTS use_count int`;
    await sql`
      UPDATE org_invites
      SET
        max_uses = COALESCE(max_uses, 1),
        use_count = COALESCE(
          use_count,
          CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END
        )
    `;
    await sql`
      ALTER TABLE org_invites
      ALTER COLUMN max_uses SET DEFAULT 1,
      ALTER COLUMN max_uses SET NOT NULL,
      ALTER COLUMN use_count SET DEFAULT 0,
      ALTER COLUMN use_count SET NOT NULL
    `;
    await sql`ALTER TABLE org_invites DROP CONSTRAINT IF EXISTS org_invites_max_uses_check`;
    await sql`
      ALTER TABLE org_invites
      ADD CONSTRAINT org_invites_max_uses_check CHECK (max_uses >= 1)
    `;
    await sql`ALTER TABLE org_invites DROP CONSTRAINT IF EXISTS org_invites_use_count_check`;
    await sql`
      ALTER TABLE org_invites
      ADD CONSTRAINT org_invites_use_count_check CHECK (use_count >= 0)
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS org_invite_redemptions (
        invite_id uuid NOT NULL REFERENCES org_invites(id) ON DELETE CASCADE,
        subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
        redeemed_at timestamptz DEFAULT now(),
        PRIMARY KEY (invite_id, subscriber_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS payouts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizer_id uuid REFERENCES organizers(id) ON DELETE CASCADE,
        total_amount numeric NOT NULL,
        token text DEFAULT 'USDC',
        status text DEFAULT 'pending' CHECK (status IN ('pending', 'deposited', 'distributed', 'claimed', 'failed')),
        tx_hash text,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`ALTER TABLE payouts ADD COLUMN IF NOT EXISTS privacy_mode text NOT NULL DEFAULT 'standard'`;
    await sql`ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_privacy_mode_check`;
    await sql`
      ALTER TABLE payouts
      ADD CONSTRAINT payouts_privacy_mode_check
      CHECK (privacy_mode IN ('standard', 'private'))
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        payout_id uuid REFERENCES payouts(id) ON DELETE CASCADE,
        organizer_id uuid REFERENCES organizers(id) ON DELETE CASCADE,
        subscriber_id uuid REFERENCES subscribers(id) ON DELETE CASCADE,
        amount numeric NOT NULL,
        status text DEFAULT 'pending' CHECK (status IN ('pending', 'claimable', 'claimed', 'expired', 'failed')),
        claimed_at timestamptz,
        tx_hash text,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_status_check`;
    await sql`
      ALTER TABLE payouts
      ADD CONSTRAINT payouts_status_check
      CHECK (status IN ('pending', 'deposited', 'distributed', 'claimed', 'failed'))
    `;
    await sql`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check`;
    await sql`
      ALTER TABLE payments
      ADD CONSTRAINT payments_status_check
      CHECK (status IN ('pending', 'claimable', 'claimed', 'expired', 'failed'))
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_id uuid REFERENCES payments(id) ON DELETE CASCADE,
        chain_id integer NOT NULL,
        commitment text NOT NULL,
        value text NOT NULL,
        holder_pk text NOT NULL,
        randomness text NOT NULL,
        nullifier text NOT NULL,
        leaf_index integer,
        created_at timestamptz DEFAULT now()
      )
    `;
    // Ensure newer column exists even on older databases
    await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS subscriber_id text`;
    await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS token_symbol text`;
    await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS pool_address text`;
    await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS deposit_tx text`;
    await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS denomination_id integer`;
    await sql`ALTER TABLE notes ALTER COLUMN chain_id DROP DEFAULT`;
    await sql`ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_chain_id_check`;
    // Env-scoped CHECK (prod mainnet vs dev testnet). A DB reused across envs can
    // retain stale opposite-env notes; remove only those rows so ADD CONSTRAINT
    // succeeds without touching valid chain_id rows for the current BLIZ_ENV.
    const removed = await sql.unsafe(`
      DELETE FROM notes
      WHERE chain_id NOT IN (${validNoteChainIdsSql})
      RETURNING id, chain_id
    `);
    if (removed.length > 0) {
      const byChain = removed.reduce<Record<string, number>>((acc, row) => {
        const key = String(row.chain_id);
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      console.warn(
        `Removed ${removed.length} stale note(s) outside ${appEnv} chain ids [${validNoteChainIdsSql}]: ${JSON.stringify(byChain)}`,
      );
    }
    await sql.unsafe(`
      ALTER TABLE notes
      ADD CONSTRAINT notes_chain_id_check
      CHECK (chain_id IN (${validNoteChainIdsSql}))
    `);

    await sql`
      CREATE TABLE IF NOT EXISTS deposit_events_cache (
        id serial PRIMARY KEY,
        chain_id integer NOT NULL,
        pool_address text NOT NULL DEFAULT '',
        block_number bigint NOT NULL,
        sender text NOT NULL,
        commitment text NOT NULL,
        amount text,
        UNIQUE(chain_id, pool_address, commitment)
      )
    `;
    await sql`ALTER TABLE deposit_events_cache ADD COLUMN IF NOT EXISTS pool_address text NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE deposit_events_cache ADD COLUMN IF NOT EXISTS amount text`;
    await sql`ALTER TABLE deposit_events_cache DROP CONSTRAINT IF EXISTS deposit_events_cache_chain_id_commitment_key`;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS deposit_events_cache_chain_pool_commitment_uidx
      ON deposit_events_cache (chain_id, pool_address, commitment)
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS scan_cursor (
        chain_id integer NOT NULL,
        pool_address text NOT NULL DEFAULT '',
        last_block bigint NOT NULL
      )
    `;
    await sql`ALTER TABLE scan_cursor ADD COLUMN IF NOT EXISTS pool_address text NOT NULL DEFAULT ''`;
    // Legacy schemas used PRIMARY KEY (chain_id) only — drop so multi-pool cursors can coexist.
    await sql`ALTER TABLE scan_cursor DROP CONSTRAINT IF EXISTS scan_cursor_pkey`;
    await sql`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          WHERE t.relname = 'scan_cursor'
            AND c.contype IN ('p', 'u')
            AND pg_get_constraintdef(c.oid) LIKE '%(chain_id)%'
            AND pg_get_constraintdef(c.oid) NOT LIKE '%pool_address%'
        LOOP
          EXECUTE format('ALTER TABLE scan_cursor DROP CONSTRAINT IF EXISTS %I', r.conname);
        END LOOP;
      END $$;
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS scan_cursor_chain_pool_uidx
      ON scan_cursor (chain_id, pool_address)
    `;
    // Drop legacy single-column unique indexes if present
    await sql`DROP INDEX IF EXISTS scan_cursor_chain_id_key`;
    await sql`DROP INDEX IF EXISTS scan_cursor_pkey`;

    // Indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_organizers_owner ON organizers(owner_address)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_subscribers_address ON subscribers(address)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organizer_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_sub ON subscriptions(subscriber_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_org_invites_organizer ON org_invites(organizer_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_org_invites_available ON org_invites(code) WHERE use_count < max_uses`;
    await sql`CREATE INDEX IF NOT EXISTS idx_org_invite_redemptions_subscriber ON org_invite_redemptions(subscriber_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_payouts_org ON payouts(organizer_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_payments_sub ON payments(subscriber_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_payments_payout ON payments(payout_id)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_payment_unique ON notes(payment_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_subscriber_chain ON notes(subscriber_id, chain_id, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_chain_payment ON notes(chain_id, payment_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_deposit_cache_chain ON deposit_events_cache(chain_id)`;

    console.log(
      `Database schema initialized (${appEnv}; note chain ids: ${validNoteChainIdsSql})`,
    );
  })().catch((err) => {
    // Allow a later request to retry after a transient / migration failure.
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

export default sql;
