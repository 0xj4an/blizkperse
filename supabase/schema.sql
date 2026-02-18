-- Blizkperse Database Schema
-- Run this in Supabase SQL Editor to create all tables

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
  status text default 'pending' check (status in ('pending', 'deposited', 'distributed', 'claimed')),
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
  status text default 'claimable' check (status in ('claimable', 'claimed', 'expired')),
  claimed_at timestamptz,
  tx_hash text,
  created_at timestamptz default now()
);

-- Indexes for common queries
create index if not exists idx_organizers_owner on organizers(owner_address);
create index if not exists idx_subscribers_address on subscribers(address);
create index if not exists idx_subscriptions_org on subscriptions(organizer_id);
create index if not exists idx_subscriptions_sub on subscriptions(subscriber_id);
create index if not exists idx_payouts_org on payouts(organizer_id);
create index if not exists idx_payments_sub on payments(subscriber_id);
create index if not exists idx_payments_payout on payments(payout_id);

-- Row Level Security (disabled for demo, enable in production)
alter table organizers enable row level security;
alter table subscribers enable row level security;
alter table subscriptions enable row level security;
alter table payouts enable row level security;
alter table payments enable row level security;

-- Public access policies (for demo - anyone can read/write)
create policy "public_read_organizers" on organizers for select using (true);
create policy "public_insert_organizers" on organizers for insert with check (true);
create policy "public_update_organizers" on organizers for update using (true);

create policy "public_read_subscribers" on subscribers for select using (true);
create policy "public_insert_subscribers" on subscribers for insert with check (true);
create policy "public_update_subscribers" on subscribers for update using (true);

create policy "public_read_subscriptions" on subscriptions for select using (true);
create policy "public_insert_subscriptions" on subscriptions for insert with check (true);

create policy "public_read_payouts" on payouts for select using (true);
create policy "public_insert_payouts" on payouts for insert with check (true);
create policy "public_update_payouts" on payouts for update using (true);

create policy "public_read_payments" on payments for select using (true);
create policy "public_insert_payments" on payments for insert with check (true);
create policy "public_update_payments" on payments for update using (true);

-- Seed: Monad Foundation organizer
insert into organizers (name, owner_address)
values ('Monad Foundation', '0x1a2B3c4D5e6F7890AbCdEf1234567890aBcDeF12')
on conflict do nothing;
