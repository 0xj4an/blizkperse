-- Blizkperse Database Schema
-- Run against any PostgreSQL database (Railway, local, etc.)

-- Organizers (entities that distribute payouts)
create table if not exists organizers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_address text not null,
  total_distributed numeric default 0,
  subscriber_count integer default 0,
  created_at timestamptz default now()
);

-- Subscribers (users who receive payouts)
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  address text unique not null,
  name text not null,
  email text,
  created_at timestamptz default now()
);

-- Subscriptions (link between subscribers and organizers)
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references organizers(id) on delete cascade,
  subscriber_id uuid references subscribers(id) on delete cascade,
  status text default 'active' check (status in ('active', 'pending')),
  created_at timestamptz default now(),
  unique(organizer_id, subscriber_id)
);

-- Payouts (batch distributions created by organizers)
create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references organizers(id) on delete cascade,
  total_amount numeric not null,
  token text default 'MON',
  status text default 'pending' check (status in ('pending', 'deposited', 'distributed', 'claimed', 'failed')),
  tx_hash text,
  created_at timestamptz default now()
);

-- Payments (individual payment entries per subscriber per payout)
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid references payouts(id) on delete cascade,
  organizer_id uuid references organizers(id) on delete cascade,
  subscriber_id uuid references subscribers(id) on delete cascade,
  amount numeric not null,
  status text default 'pending' check (status in ('pending', 'claimable', 'claimed', 'expired', 'failed')),
  claimed_at timestamptz,
  tx_hash text,
  created_at timestamptz default now()
);

-- Notes (private ZK note data for proof generation)
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references payments(id) on delete cascade,
  subscriber_id text,
  chain_id integer not null,
  commitment text not null,
  value text not null,
  holder_pk text not null,
  randomness text not null,
  nullifier text not null,
  leaf_index integer,
  created_at timestamptz default now()
);

alter table notes drop constraint if exists notes_chain_id_check;
-- Choose the constraint that matches the target environment.
-- Production DBs: mainnet only (143, 42220).
-- Development DBs: testnet only (10143, 11142220).
-- The app runtime (`web/lib/db.ts`) applies the correct variant automatically using `BLIZ_ENV`.
-- Before ADD CONSTRAINT it deletes notes whose chain_id is outside the active env
-- set (stale opposite-env leftovers from a shared / reused database).
-- Manual cleanup if needed (production example):
--   delete from notes where chain_id not in (143, 42220);
-- alter table notes add constraint notes_chain_id_check
-- check (chain_id in (143, 42220));
-- alter table notes add constraint notes_chain_id_check
-- check (chain_id in (10143, 11142220));

-- Indexes for common queries
create index if not exists idx_organizers_owner on organizers(owner_address);
create index if not exists idx_subscribers_address on subscribers(address);
create index if not exists idx_subscriptions_org on subscriptions(organizer_id);
create index if not exists idx_subscriptions_sub on subscriptions(subscriber_id);
create index if not exists idx_payouts_org on payouts(organizer_id);
create index if not exists idx_payments_sub on payments(subscriber_id);
create index if not exists idx_payments_payout on payments(payout_id);
create unique index if not exists idx_notes_payment_unique on notes(payment_id);
create index if not exists idx_notes_subscriber_chain on notes(subscriber_id, chain_id, created_at);
create index if not exists idx_notes_chain_payment on notes(chain_id, payment_id);

-- Seed: Monad Test organizer
insert into organizers (name, owner_address)
values ('Monad Test', '0xe9f75e7eac8288473dc6e40e4c67707c07fa6a4e')
on conflict do nothing;

-- Seed: 20 demo subscribers
insert into subscribers (address, name) values
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
on conflict (address) do nothing;

-- Seed: Link all subscribers to the Monad Test org
insert into subscriptions (organizer_id, subscriber_id)
select o.id, s.id
from organizers o
cross join subscribers s
where o.owner_address = '0xe9f75e7eac8288473dc6e40e4c67707c07fa6a4e'
on conflict (organizer_id, subscriber_id) do nothing;

-- Update subscriber count
update organizers set subscriber_count = (
  select count(*) from subscriptions where organizer_id = organizers.id
)
where owner_address = '0xe9f75e7eac8288473dc6e40e4c67707c07fa6a4e';
