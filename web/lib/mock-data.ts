// ── Types ──────────────────────────────────────────────

export interface Payer {
  id: string;
  name: string;
  address: string;
  totalDistributed: number;
  participantCount: number;
}

export interface Participant {
  id: string;
  address: string;
  name: string;
  email?: string;
  registeredAt: string;
}

export interface Payout {
  id: string;
  payerId: string;
  participants: { participantId: string; amount: number }[];
  totalAmount: number;
  status: "pending" | "deposited" | "distributed" | "claimed";
  createdAt: string;
  txHash?: string;
}

export interface Registration {
  id: string;
  payerId: string;
  participantId: string;
  status: "active" | "pending";
  registeredAt: string;
}

export interface Payment {
  id: string;
  payoutId: string;
  payerId: string;
  participantId: string;
  amount: number;
  status: "claimable" | "claimed" | "expired";
  claimedAt?: string;
  txHash?: string;
}

// ── Mock Data ──────────────────────────────────────────

export const payers: Payer[] = [
  {
    id: "payer-1",
    name: "Monad Foundation",
    address: "0x1a2B3c4D5e6F7890AbCdEf1234567890aBcDeF12",
    totalDistributed: 25000,
    participantCount: 12,
  },
  {
    id: "payer-2",
    name: "DeFi Guild DAO",
    address: "0x2B3c4D5e6F7890AbCdEf1234567890aBcDeF1234",
    totalDistributed: 8500,
    participantCount: 6,
  },
  {
    id: "payer-3",
    name: "Hackathon Rewards",
    address: "0x3c4D5e6F7890AbCdEf1234567890aBcDeF123456",
    totalDistributed: 3200,
    participantCount: 4,
  },
];

export const participants: Participant[] = [
  {
    id: "part-1",
    address: "0xAa1Bb2Cc3Dd4Ee5Ff6001122334455667788AaBb",
    name: "Alice",
    email: "alice@example.com",
    registeredAt: "2025-12-01T10:00:00Z",
  },
  {
    id: "part-2",
    address: "0xBb2Cc3Dd4Ee5Ff6Aa1001122334455667788BbCc",
    name: "Bob",
    email: "bob@example.com",
    registeredAt: "2025-12-03T14:30:00Z",
  },
  {
    id: "part-3",
    address: "0xCc3Dd4Ee5Ff6Aa1Bb2001122334455667788CcDd",
    name: "Carol",
    registeredAt: "2025-12-05T09:15:00Z",
  },
  {
    id: "part-4",
    address: "0xDd4Ee5Ff6Aa1Bb2Cc3001122334455667788DdEe",
    name: "Dave",
    email: "dave@example.com",
    registeredAt: "2025-12-07T18:00:00Z",
  },
  {
    id: "part-5",
    address: "0xEe5Ff6Aa1Bb2Cc3Dd4001122334455667788EeFf",
    name: "Eve",
    registeredAt: "2025-12-10T11:45:00Z",
  },
  {
    id: "part-6",
    address: "0xFf6Aa1Bb2Cc3Dd4Ee5001122334455667788FfAa",
    name: "Frank",
    email: "frank@example.com",
    registeredAt: "2025-12-12T16:20:00Z",
  },
  {
    id: "part-7",
    address: "0xAa7Bb8Cc9Dd0Ee1Ff2001122334455667788AaBb",
    name: "Grace",
    registeredAt: "2025-12-15T08:30:00Z",
  },
  {
    id: "part-8",
    address: "0xBb8Cc9Dd0Ee1Ff2Aa3001122334455667788BbCc",
    name: "Hank",
    email: "hank@example.com",
    registeredAt: "2025-12-18T13:00:00Z",
  },
];

export const registrations: Registration[] = [
  { id: "reg-1", payerId: "payer-1", participantId: "part-1", status: "active", registeredAt: "2025-12-01T10:00:00Z" },
  { id: "reg-2", payerId: "payer-1", participantId: "part-2", status: "active", registeredAt: "2025-12-03T14:30:00Z" },
  { id: "reg-3", payerId: "payer-1", participantId: "part-3", status: "active", registeredAt: "2025-12-05T09:15:00Z" },
  { id: "reg-4", payerId: "payer-1", participantId: "part-4", status: "active", registeredAt: "2025-12-07T18:00:00Z" },
  { id: "reg-5", payerId: "payer-1", participantId: "part-5", status: "active", registeredAt: "2025-12-10T11:45:00Z" },
  { id: "reg-6", payerId: "payer-2", participantId: "part-1", status: "active", registeredAt: "2025-12-02T12:00:00Z" },
  { id: "reg-7", payerId: "payer-2", participantId: "part-6", status: "active", registeredAt: "2025-12-12T16:20:00Z" },
  { id: "reg-8", payerId: "payer-2", participantId: "part-7", status: "active", registeredAt: "2025-12-15T08:30:00Z" },
  { id: "reg-9", payerId: "payer-3", participantId: "part-2", status: "active", registeredAt: "2025-12-04T10:00:00Z" },
  { id: "reg-10", payerId: "payer-3", participantId: "part-8", status: "active", registeredAt: "2025-12-18T13:00:00Z" },
];

export const payouts: Payout[] = [
  {
    id: "payout-1",
    payerId: "payer-1",
    participants: [
      { participantId: "part-1", amount: 500 },
      { participantId: "part-2", amount: 500 },
      { participantId: "part-3", amount: 500 },
    ],
    totalAmount: 1500,
    status: "distributed",
    createdAt: "2025-12-20T10:00:00Z",
    txHash: "0xabc123def456789012345678901234567890abcdef1234567890abcdef123456",
  },
  {
    id: "payout-2",
    payerId: "payer-1",
    participants: [
      { participantId: "part-4", amount: 1000 },
      { participantId: "part-5", amount: 1000 },
    ],
    totalAmount: 2000,
    status: "deposited",
    createdAt: "2026-01-05T14:00:00Z",
    txHash: "0xdef456789012345678901234567890abcdef1234567890abcdef123456abc123",
  },
  {
    id: "payout-3",
    payerId: "payer-2",
    participants: [
      { participantId: "part-1", amount: 750 },
      { participantId: "part-6", amount: 750 },
    ],
    totalAmount: 1500,
    status: "distributed",
    createdAt: "2026-01-10T09:00:00Z",
    txHash: "0x789012345678901234567890abcdef1234567890abcdef123456abc123def456",
  },
];

export const payments: Payment[] = [
  {
    id: "pay-1",
    payoutId: "payout-1",
    payerId: "payer-1",
    participantId: "part-1",
    amount: 500,
    status: "claimed",
    claimedAt: "2025-12-21T08:00:00Z",
    txHash: "0x111111111111111111111111111111111111111111111111111111111111111a",
  },
  {
    id: "pay-2",
    payoutId: "payout-1",
    payerId: "payer-1",
    participantId: "part-2",
    amount: 500,
    status: "claimable",
  },
  {
    id: "pay-3",
    payoutId: "payout-1",
    payerId: "payer-1",
    participantId: "part-3",
    amount: 500,
    status: "claimable",
  },
  {
    id: "pay-4",
    payoutId: "payout-2",
    payerId: "payer-1",
    participantId: "part-4",
    amount: 1000,
    status: "claimable",
  },
  {
    id: "pay-5",
    payoutId: "payout-2",
    payerId: "payer-1",
    participantId: "part-5",
    amount: 1000,
    status: "claimable",
  },
  {
    id: "pay-6",
    payoutId: "payout-3",
    payerId: "payer-2",
    participantId: "part-1",
    amount: 750,
    status: "claimed",
    claimedAt: "2026-01-11T12:00:00Z",
    txHash: "0x222222222222222222222222222222222222222222222222222222222222222b",
  },
  {
    id: "pay-7",
    payoutId: "payout-3",
    payerId: "payer-2",
    participantId: "part-6",
    amount: 750,
    status: "claimable",
  },
];

// ── Helpers ────────────────────────────────────────────

export function getPayerById(id: string) {
  return payers.find((p) => p.id === id);
}

export function getParticipantById(id: string) {
  return participants.find((p) => p.id === id);
}

export function getRegistrationsForPayer(payerId: string) {
  return registrations.filter((r) => r.payerId === payerId);
}

export function getRegistrationsForParticipant(participantId: string) {
  return registrations.filter((r) => r.participantId === participantId);
}

export function getPayoutsForPayer(payerId: string) {
  return payouts.filter((p) => p.payerId === payerId);
}

export function getPaymentsForParticipant(participantId: string) {
  return payments.filter((p) => p.participantId === participantId);
}

export function getPaymentById(id: string) {
  return payments.find((p) => p.id === id);
}

/**
 * For the demo, we simulate "current user" being participant part-1
 * and payer payer-1. In production, this would come from the wallet address.
 */
export const CURRENT_PAYER_ID = "payer-1";
export const CURRENT_PARTICIPANT_ID = "part-1";
