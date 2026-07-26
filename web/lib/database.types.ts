// Row types matching sql/schema.sql

export interface OrganizerRow {
  id: string;
  name: string;
  owner_address: string;
  total_distributed: number;
  subscriber_count: number;
  created_at: string;
}

export interface SubscriberRow {
  id: string;
  address: string;
  name: string;
  email: string | null;
  created_at: string;
}

export interface SubscriptionRow {
  id: string;
  organizer_id: string;
  subscriber_id: string;
  status: string;
  created_at: string;
}

export interface OrgInviteRow {
  id: string;
  organizer_id: string;
  code: string;
  created_by: string;
  created_at: string;
  used_at: string | null;
  used_by_subscriber_id: string | null;
  expires_at: string | null;
  max_uses: number;
  use_count: number;
}

export interface OrgInviteRedemptionRow {
  invite_id: string;
  subscriber_id: string;
  redeemed_at: string;
}

export interface PayoutRow {
  id: string;
  organizer_id: string;
  total_amount: number;
  status: string;
  tx_hash: string | null;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  payout_id: string;
  organizer_id: string;
  subscriber_id: string;
  amount: number;
  status: string;
  claimed_at: string | null;
  tx_hash: string | null;
  created_at: string;
}
