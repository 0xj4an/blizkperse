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
    totalDistributed: 0,
    participantCount: 0,
  },
];

export const participants: Participant[] = [];

export const registrations: Registration[] = [];

export const payouts: Payout[] = [];

export const payments: Payment[] = [];

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
