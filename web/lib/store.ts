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
      // API unavailable — local-only mode
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
  walletClient?: WalletClient;
  onProgress?: (step: string, current: number, total: number) => void;
}): Promise<Payout> {
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
