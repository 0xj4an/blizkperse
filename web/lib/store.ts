"use client";

import { useSyncExternalStore } from "react";
import type { WalletClient, Hex } from "viem";
import {
  approveUSDm,
  depositToPool,
  withdrawFromPool,
  getPublicClient,
} from "./contracts";
import {
  createNote,
  addressToFieldPk,
  generateRandomField,
  bigintToBytes32,
  type ProofResult,
} from "./zk";

// ── Types ──────────────────────────────────────────────

export interface Organizer {
  id: string;
  name: string;
  address: string;
  totalDistributed: number;
  subscriberCount: number;
}

export interface Subscriber {
  id: string;
  address: string;
  name: string;
  email?: string;
  joinedAt: string;
}

export interface Subscription {
  id: string;
  organizerId: string;
  subscriberId: string;
  status: "active" | "pending";
  joinedAt: string;
}

export interface Payout {
  id: string;
  organizerId: string;
  totalAmount: number;
  token: string;
  status: "pending" | "deposited" | "distributed" | "claimed";
  createdAt: string;
  txHash?: string;
}

export interface Payment {
  id: string;
  payoutId: string;
  organizerId: string;
  subscriberId: string;
  amount: number;
  status: "claimable" | "claimed" | "expired";
  claimedAt?: string;
  txHash?: string;
}

// ── Store (local cache, synced via API routes) ──────────

interface StoreState {
  organizers: Organizer[];
  subscribers: Subscriber[];
  subscriptions: Subscription[];
  payouts: Payout[];
  payments: Payment[];
  loaded: boolean;
}

let state: StoreState = {
  organizers: [],
  subscribers: [],
  subscriptions: [],
  payouts: [],
  payments: [],
  loaded: false,
};

const listeners = new Set<() => void>();

function emitChange() {
  state = { ...state };
  listeners.forEach((l) => l());
}

function subscribeFn(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

// ── Local ID generator ───────────────────────────────────

function localId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mockTxHash() {
  const hex = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `0x${hex}`;
}

// ── API helper ───────────────────────────────────────────

async function api<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Local seed data (when DB unavailable) ───────────────

const SEED_ORG_ID = "seed-org-monad-test";

const SEED_SUBSCRIBERS: { id: string; address: string; name: string; email: string }[] = [
  { id: "seed-sub-01", address: "0x7a3f9c1d8e2b4a6f0c5d7e9b1a3f5c8d2e4a6b", name: "cryptovault.nad", email: "" },
  { id: "seed-sub-02", address: "0x2e8d4b6a1c9f3e7d5b0a8c2f6e4d1b9a3c7f5e", name: "degenwhale.nad", email: "" },
  { id: "seed-sub-03", address: "0xf1c3a5e7d9b2f4a6c8e0d2b4a6f8c1e3d5a7b9", name: "moonboi_42", email: "" },
  { id: "seed-sub-04", address: "0x4d6b8a0c2e4f1d3a5c7e9b1d3f5a7c9e2b4d6a", name: "ser_builder", email: "" },
  { id: "seed-sub-05", address: "0x9a2c4e6b8d0f1a3c5e7d9b2a4c6e8f0d1a3b5c", name: "0xpurplehaze", email: "" },
  { id: "seed-sub-06", address: "0x3f5d7b9a1c3e5d7f9b2a4c6e8d0f2a4c6b8d1e", name: "nadsurfr.nad", email: "" },
  { id: "seed-sub-07", address: "0xb8e0d2f4a6c8e1b3d5a7c9f2e4b6d8a0c2e4f6", name: "wagmi_maria", email: "" },
  { id: "seed-sub-08", address: "0x5c7e9a1b3d5f7a9c2e4b6d8f0a2c4e6b8d1f3a", name: "ethmaxi_leo", email: "" },
  { id: "seed-sub-09", address: "0xd1a3c5e7b9d2f4a6c8e0b2d4f6a8c1e3b5d7a9", name: "alphagrinder", email: "" },
  { id: "seed-sub-10", address: "0x6b8d0f2a4c6e8a1b3d5f7c9e2a4b6d8f0c2e4a", name: "monad_queen", email: "" },
  { id: "seed-sub-11", address: "0xa9c1e3b5d7f9a2c4e6b8d0f2a4c6e8b1d3f5a7", name: "ngmi_never.nad", email: "" },
  { id: "seed-sub-12", address: "0x0f2a4c6e8b1d3f5a7c9e2b4d6f8a0c2e4b6d8f", name: "zkproof_pablo", email: "" },
  { id: "seed-sub-13", address: "0xc4e6b8d0f2a4c6e9b1d3f5a7c9e2b4d6f8a1c3", name: "purplepilled", email: "" },
  { id: "seed-sub-14", address: "0x8d1f3a5c7e9b2d4f6a8c0e2b4d6f8a1c3e5b7d", name: "onchain_rosa", email: "" },
  { id: "seed-sub-15", address: "0xe7b9d2f4a6c8e0b3d5a7c9f1e3b5d7a9c2e4f6", name: "gm_fren.nad", email: "" },
  { id: "seed-sub-16", address: "0x1d3f5a7c9e2b4d6f8a0c2e4b6d8f1a3c5e7b9d", name: "wen_airdrop", email: "" },
  { id: "seed-sub-17", address: "0xa6c8e0b2d4f6a8c1e3b5d7f9a2c4e6b8d0f2a4", name: "solidity_sam", email: "" },
  { id: "seed-sub-18", address: "0x3e5b7d9f1a3c5e7b9d2f4a6c8e0b2d4f6a8c1e", name: "yield_farmer", email: "" },
  { id: "seed-sub-19", address: "0xc9e2b4d6f8a1c3e5b7d9f2a4c6e8b0d2f4a6c8", name: "based_dev.nad", email: "" },
  { id: "seed-sub-20", address: "0x7f9a2c4e6b8d1f3a5c7e9b2d4f6a8c0e2b4d6f", name: "diamond_hands", email: "" },
];

function seedLocalData() {
  state.organizers = [{
    id: SEED_ORG_ID,
    name: "Monad Test",
    address: "0xe9f75e7eac8288473dc6e40e4c67707c07fa6a4e",
    totalDistributed: 0,
    subscriberCount: SEED_SUBSCRIBERS.length,
  }];

  state.subscribers = SEED_SUBSCRIBERS.map((s) => ({
    id: s.id,
    address: s.address,
    name: s.name,
    email: s.email,
    joinedAt: new Date().toISOString(),
  }));

  state.subscriptions = SEED_SUBSCRIBERS.map((s, i) => ({
    id: `seed-subscription-${i + 1}`,
    organizerId: SEED_ORG_ID,
    subscriberId: s.id,
    status: "active" as const,
    joinedAt: new Date().toISOString(),
  }));

  state.payouts = [];
  state.payments = [];
}

// ── Hydrate ──────────────────────────────────────────────

let hydratePromise: Promise<void> | null = null;

export function hydrateStore() {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const data = await api<{
      organizers: Array<Record<string, unknown>>;
      subscribers: Array<Record<string, unknown>>;
      subscriptions: Array<Record<string, unknown>>;
      payouts: Array<Record<string, unknown>>;
      payments: Array<Record<string, unknown>>;
    }>("/api/data");

    if (!data) {
      // API unavailable — seed local demo data
      seedLocalData();
      state.loaded = true;
      emitChange();
      return;
    }

    state.organizers = data.organizers.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      address: r.owner_address as string,
      totalDistributed: Number(r.total_distributed),
      subscriberCount: Number(r.subscriber_count),
    }));

    state.subscribers = data.subscribers.map((r) => ({
      id: r.id as string,
      address: r.address as string,
      name: r.name as string,
      email: (r.email as string) ?? undefined,
      joinedAt: r.created_at as string,
    }));

    state.subscriptions = data.subscriptions.map((r) => ({
      id: r.id as string,
      organizerId: r.organizer_id as string,
      subscriberId: r.subscriber_id as string,
      status: r.status as "active" | "pending",
      joinedAt: r.created_at as string,
    }));

    state.payouts = data.payouts.map((r) => ({
      id: r.id as string,
      organizerId: r.organizer_id as string,
      totalAmount: Number(r.total_amount),
      token: (r.token as string) ?? "MON",
      status: r.status as Payout["status"],
      createdAt: r.created_at as string,
      txHash: (r.tx_hash as string) ?? undefined,
    }));

    state.payments = data.payments.map((r) => ({
      id: r.id as string,
      payoutId: r.payout_id as string,
      organizerId: r.organizer_id as string,
      subscriberId: r.subscriber_id as string,
      amount: Number(r.amount),
      status: r.status as Payment["status"],
      claimedAt: (r.claimed_at as string) ?? undefined,
      txHash: (r.tx_hash as string) ?? undefined,
    }));

    state.loaded = true;
    emitChange();
  })();
  return hydratePromise;
}

// ── React hook ─────────────────────────────────────────

export function useStore() {
  const s = useSyncExternalStore(subscribeFn, getSnapshot, getSnapshot);
  if (!s.loaded) hydrateStore();
  return s;
}

// ── Helpers ────────────────────────────────────────────

export function getOrganizerById(id: string) {
  return state.organizers.find((o) => o.id === id);
}

export function getSubscriberById(id: string) {
  return state.subscribers.find((s) => s.id === id);
}

export function getSubscriberByAddress(address: string) {
  return state.subscribers.find(
    (s) => s.address.toLowerCase() === address.toLowerCase()
  );
}

// ── Actions ─────────────────────────────────────────────

export async function ensureSubscriber(
  address: string,
  name?: string,
  email?: string
): Promise<Subscriber> {
  const existing = getSubscriberByAddress(address);
  if (existing) return existing;

  const displayName = name ?? `${address.slice(0, 6)}...${address.slice(-4)}`;

  const data = await api<Record<string, unknown>>("/api/subscribers", {
    method: "POST",
    body: JSON.stringify({ address, name: displayName, email }),
  });

  if (data) {
    const sub: Subscriber = {
      id: data.id as string,
      address: data.address as string,
      name: data.name as string,
      email: (data.email as string) ?? undefined,
      joinedAt: data.created_at as string,
    };
    state.subscribers = [...state.subscribers.filter((s) => s.id !== sub.id), sub];
    emitChange();
    return sub;
  }

  // local-only fallback
  const sub: Subscriber = {
    id: localId(),
    address,
    name: displayName,
    email,
    joinedAt: new Date().toISOString(),
  };
  state.subscribers = [...state.subscribers, sub];
  emitChange();
  return sub;
}

export async function createOrganizer(params: {
  name: string;
  address: string;
}): Promise<Organizer> {
  const data = await api<Record<string, unknown>>("/api/organizers", {
    method: "POST",
    body: JSON.stringify({ name: params.name, owner_address: params.address }),
  });

  if (data) {
    const org: Organizer = {
      id: data.id as string,
      name: data.name as string,
      address: data.owner_address as string,
      totalDistributed: 0,
      subscriberCount: 0,
    };
    state.organizers = [...state.organizers, org];
    emitChange();
    return org;
  }

  // local-only fallback
  const org: Organizer = {
    id: localId(),
    name: params.name,
    address: params.address,
    totalDistributed: 0,
    subscriberCount: 0,
  };
  state.organizers = [...state.organizers, org];
  emitChange();
  return org;
}

export async function joinOrganizer(
  organizerId: string,
  subscriberId: string
): Promise<Subscription> {
  let subData: Subscription | null = null;

  const data = await api<Record<string, unknown>>("/api/subscriptions", {
    method: "POST",
    body: JSON.stringify({ organizer_id: organizerId, subscriber_id: subscriberId }),
  });

  if (data) {
    subData = {
      id: data.id as string,
      organizerId: data.organizer_id as string,
      subscriberId: data.subscriber_id as string,
      status: data.status as "active",
      joinedAt: data.created_at as string,
    };
  }

  if (!subData) {
    subData = {
      id: localId(),
      organizerId,
      subscriberId,
      status: "active",
      joinedAt: new Date().toISOString(),
    };
  }

  state.subscriptions = [...state.subscriptions, subData];

  const org = state.organizers.find((o) => o.id === organizerId);
  if (org) {
    org.subscriberCount += 1;
    state.organizers = [...state.organizers];
  }

  emitChange();
  return subData;
}

export async function createPayout(params: {
  organizerId: string;
  recipients: { subscriberId: string; amount: number }[];
  token?: string;
  walletClient?: WalletClient;
  onProgress?: (step: string, current: number, total: number) => void;
}): Promise<Payout> {
  const token = params.token ?? "MON";
  const totalAmount = params.recipients.reduce((s, r) => s + r.amount, 0);

  // Calculate total notes needed (1 note = 1 USDm)
  const totalNotes = params.recipients.reduce(
    (s, r) => s + Math.floor(r.amount),
    0
  );

  let txHash: string;

  // ── On-chain deposit flow ──────────────────────────────
  if (params.walletClient) {
    const publicClient = getPublicClient();

    // Step 1: Batch approve total amount
    params.onProgress?.("Approving USDm", 0, totalNotes);
    const approveTx = await approveUSDm(
      params.walletClient,
      BigInt(totalNotes) * 1_000_000n
    );
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    // Step 2: Deposit notes one by one
    let noteIndex = 0;
    let lastTxHash = approveTx;

    for (const recipient of params.recipients) {
      const sub = getSubscriberById(recipient.subscriberId);
      if (!sub) continue;

      const pk_b = addressToFieldPk(sub.address);
      const noteCount = Math.floor(recipient.amount);

      for (let n = 0; n < noteCount; n++) {
        noteIndex++;
        params.onProgress?.("Depositing note", noteIndex, totalNotes);

        const randomness = generateRandomField();
        const note = await createNote(1n, pk_b, randomness);
        const commitment = bigintToBytes32(note.commitment) as Hex;

        const depositTx = await depositToPool(params.walletClient, commitment);
        await publicClient.waitForTransactionReceipt({ hash: depositTx });
        lastTxHash = depositTx;

        // Store note data for recipient to later claim
        await api("/api/notes", {
          method: "POST",
          body: JSON.stringify({
            subscriber_id: recipient.subscriberId,
            commitment: bigintToBytes32(note.commitment),
            value: bigintToBytes32(note.value),
            holder_pk: bigintToBytes32(note.holder),
            randomness: bigintToBytes32(note.random),
            nullifier: bigintToBytes32(note.nullifier),
          }),
        });
      }
    }

    txHash = lastTxHash;
  } else {
    // Fallback: mock tx hash when no wallet connected
    txHash = mockTxHash();
  }

  // ── Persist payout record ──────────────────────────────
  let payout: Payout;
  let newPayments: Payment[] = [];

  const data = await api<{
    payout: Record<string, unknown>;
    payments: Array<Record<string, unknown>>;
  }>("/api/payouts", {
    method: "POST",
    body: JSON.stringify({
      organizer_id: params.organizerId,
      total_amount: totalAmount,
      token,
      tx_hash: txHash,
      recipients: params.recipients.map((r) => ({
        subscriber_id: r.subscriberId,
        amount: r.amount,
      })),
    }),
  });

  if (data) {
    payout = {
      id: data.payout.id as string,
      organizerId: data.payout.organizer_id as string,
      totalAmount: Number(data.payout.total_amount),
      token: (data.payout.token as string) ?? token,
      status: "deposited",
      createdAt: data.payout.created_at as string,
      txHash,
    };

    newPayments = data.payments.map((r) => ({
      id: r.id as string,
      payoutId: r.payout_id as string,
      organizerId: r.organizer_id as string,
      subscriberId: r.subscriber_id as string,
      amount: Number(r.amount),
      status: "claimable" as const,
    }));
  } else {
    const payoutId = localId();
    payout = {
      id: payoutId,
      organizerId: params.organizerId,
      totalAmount,
      token,
      status: "deposited",
      createdAt: new Date().toISOString(),
      txHash,
    };

    newPayments = params.recipients.map((r) => ({
      id: localId(),
      payoutId,
      organizerId: params.organizerId,
      subscriberId: r.subscriberId,
      amount: r.amount,
      status: "claimable" as const,
    }));
  }

  const org = state.organizers.find((o) => o.id === params.organizerId);
  if (org) {
    org.totalDistributed += totalAmount;
    state.organizers = [...state.organizers];
  }

  state.payouts = [payout, ...state.payouts];
  state.payments = [...state.payments, ...newPayments];
  emitChange();
  return payout;
}

export async function claimPayment(
  paymentId: string,
  walletClient?: WalletClient,
  proofResult?: ProofResult
): Promise<{ txHash: string }> {
  let txHash: string;

  // ── On-chain withdraw flow ─────────────────────────────
  if (walletClient && proofResult) {
    const publicClient = getPublicClient();
    const withdrawTx = await withdrawFromPool(walletClient, {
      expectedRoot: proofResult.publicInputs.expectedRoot,
      nullifierIn: proofResult.publicInputs.nullifierIn,
      merkleProofLength: proofResult.publicInputs.merkleProofLength,
      proof: proofResult.proof,
    });
    await publicClient.waitForTransactionReceipt({ hash: withdrawTx });
    txHash = withdrawTx;
  } else {
    txHash = mockTxHash();
  }

  const now = new Date().toISOString();

  await api(`/api/payments/${paymentId}/claim`, {
    method: "PATCH",
    body: JSON.stringify({ tx_hash: txHash }),
  });

  const payment = state.payments.find((p) => p.id === paymentId);
  if (payment) {
    payment.status = "claimed";
    payment.claimedAt = now;
    payment.txHash = txHash;
    state.payments = [...state.payments];
    emitChange();
  }

  return { txHash };
}
