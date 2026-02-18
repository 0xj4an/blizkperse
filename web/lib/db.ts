import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL not set — API routes will fail");
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

    // Seed: Monad Test organizer
    await sql`
      INSERT INTO organizers (name, owner_address)
      VALUES ('Monad Test', '0xe9f75e7eac8288473dc6e40e4c67707c07fa6a4e')
      ON CONFLICT DO NOTHING
    `;

    // Seed: 20 demo subscribers
    await sql`
      INSERT INTO subscribers (address, name) VALUES
        ('0x7a3f9c1d8e2b4a6f0c5d7e9b1a3f5c8d2e4a6b', 'cryptovault.nad'),
        ('0x2e8d4b6a1c9f3e7d5b0a8c2f6e4d1b9a3c7f5e', 'degenwhale.nad'),
        ('0xf1c3a5e7d9b2f4a6c8e0d2b4a6f8c1e3d5a7b9', 'moonboi_42'),
        ('0x4d6b8a0c2e4f1d3a5c7e9b1d3f5a7c9e2b4d6a', 'ser_builder'),
        ('0x9a2c4e6b8d0f1a3c5e7d9b2a4c6e8f0d1a3b5c', '0xpurplehaze'),
        ('0x3f5d7b9a1c3e5d7f9b2a4c6e8d0f2a4c6b8d1e', 'nadsurfr.nad'),
        ('0xb8e0d2f4a6c8e1b3d5a7c9f2e4b6d8a0c2e4f6', 'wagmi_maria'),
        ('0x5c7e9a1b3d5f7a9c2e4b6d8f0a2c4e6b8d1f3a', 'ethmaxi_leo'),
        ('0xd1a3c5e7b9d2f4a6c8e0b2d4f6a8c1e3b5d7a9', 'alphagrinder'),
        ('0x6b8d0f2a4c6e8a1b3d5f7c9e2a4b6d8f0c2e4a', 'monad_queen'),
        ('0xa9c1e3b5d7f9a2c4e6b8d0f2a4c6e8b1d3f5a7', 'ngmi_never.nad'),
        ('0x0f2a4c6e8b1d3f5a7c9e2b4d6f8a0c2e4b6d8f', 'zkproof_pablo'),
        ('0xc4e6b8d0f2a4c6e9b1d3f5a7c9e2b4d6f8a1c3', 'purplepilled'),
        ('0x8d1f3a5c7e9b2d4f6a8c0e2b4d6f8a1c3e5b7d', 'onchain_rosa'),
        ('0xe7b9d2f4a6c8e0b3d5a7c9f1e3b5d7a9c2e4f6', 'gm_fren.nad'),
        ('0x1d3f5a7c9e2b4d6f8a0c2e4b6d8f1a3c5e7b9d', 'wen_airdrop'),
        ('0xa6c8e0b2d4f6a8c1e3b5d7f9a2c4e6b8d0f2a4', 'solidity_sam'),
        ('0x3e5b7d9f1a3c5e7b9d2f4a6c8e0b2d4f6a8c1e', 'yield_farmer'),
        ('0xc9e2b4d6f8a1c3e5b7d9f2a4c6e8b0d2f4a6c8', 'based_dev.nad'),
        ('0x7f9a2c4e6b8d1f3a5c7e9b2d4f6a8c0e2b4d6f', 'diamond_hands')
      ON CONFLICT (address) DO NOTHING
    `;

    // Seed: Link all subscribers to the Monad Test org
    await sql`
      INSERT INTO subscriptions (organizer_id, subscriber_id)
      SELECT o.id, s.id
      FROM organizers o
      CROSS JOIN subscribers s
      WHERE o.owner_address = '0xe9f75e7eac8288473dc6e40e4c67707c07fa6a4e'
      ON CONFLICT (organizer_id, subscriber_id) DO NOTHING
    `;

    // Update subscriber count
    await sql`
      UPDATE organizers SET subscriber_count = (
        SELECT count(*) FROM subscriptions WHERE organizer_id = organizers.id
      )
      WHERE owner_address = '0xe9f75e7eac8288473dc6e40e4c67707c07fa6a4e'
    `;

    console.log("Database schema initialized");
  })();
  return schemaReady;
}

export default sql;
