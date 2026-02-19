import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

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
      CREATE TABLE IF NOT EXISTS payouts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizer_id uuid REFERENCES organizers(id) ON DELETE CASCADE,
        total_amount numeric NOT NULL,
        token text DEFAULT 'MON',
        status text DEFAULT 'pending' CHECK (status IN ('pending', 'deposited', 'distributed', 'claimed')),
        tx_hash text,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        payout_id uuid REFERENCES payouts(id) ON DELETE CASCADE,
        organizer_id uuid REFERENCES organizers(id) ON DELETE CASCADE,
        subscriber_id uuid REFERENCES subscribers(id) ON DELETE CASCADE,
        amount numeric NOT NULL,
        status text DEFAULT 'claimable' CHECK (status IN ('claimable', 'claimed', 'expired')),
        claimed_at timestamptz,
        tx_hash text,
        created_at timestamptz DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_id uuid REFERENCES payments(id) ON DELETE CASCADE,
        commitment text NOT NULL,
        value text NOT NULL,
        holder_pk text NOT NULL,
        randomness text NOT NULL,
        nullifier text NOT NULL,
        leaf_index integer,
        created_at timestamptz DEFAULT now()
      )
    `;

    // Indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_organizers_owner ON organizers(owner_address)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_subscribers_address ON subscribers(address)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organizer_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_sub ON subscriptions(subscriber_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_payouts_org ON payouts(organizer_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_payments_sub ON payments(subscriber_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_payments_payout ON payments(payout_id)`;

    console.log("Database schema initialized");
  })();
  return schemaReady;
}

export default sql;
