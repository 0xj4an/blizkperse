"use client";

import { useSyncExternalStore } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";

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

// ── Store (local cache, optionally synced with Supabase) ─

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

// ── Hydrate ──────────────────────────────────────────────

let hydratePromise: Promise<void> | null = null;

export function hydrateStore() {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    if (!isSupabaseConfigured) {
      state.loaded = true;
      emitChange();
      return;
    }

    const [orgs, subs, subscriptions, payouts, payments] = await Promise.all([
      supabase.from("organizers").select("*"),
      supabase.from("subscribers").select("*"),
      supabase.from("subscriptions").select("*"),
      supabase.from("payouts").select("*").order("created_at", { ascending: false }),
      supabase.from("payments").select("*"),
    ]);

    state.organizers = (orgs.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      address: r.owner_address,
      totalDistributed: Number(r.total_distributed),
      subscriberCount: r.subscriber_count,
    }));

    state.subscribers = (subs.data ?? []).map((r) => ({
      id: r.id,
      address: r.address,
      name: r.name,
      email: r.email ?? undefined,
      joinedAt: r.created_at,
    }));

    state.subscriptions = (subscriptions.data ?? []).map((r) => ({
      id: r.id,
      organizerId: r.organizer_id,
      subscriberId: r.subscriber_id,
      status: r.status as "active" | "pending",
      joinedAt: r.created_at,
    }));

    state.payouts = (payouts.data ?? []).map((r) => ({
      id: r.id,
      organizerId: r.organizer_id,
      totalAmount: Number(r.total_amount),
      status: r.status as Payout["status"],
      createdAt: r.created_at,
      txHash: r.tx_hash ?? undefined,
    }));

    state.payments = (payments.data ?? []).map((r) => ({
      id: r.id,
      payoutId: r.payout_id,
      organizerId: r.organizer_id,
      subscriberId: r.subscriber_id,
      amount: Number(r.amount),
      status: r.status as Payment["status"],
      claimedAt: r.claimed_at ?? undefined,
      txHash: r.tx_hash ?? undefined,
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

  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from("subscribers")
      .upsert({ address: address.toLowerCase(), name: displayName, email }, { onConflict: "address" })
      .select()
      .single();

    if (!error && data) {
      const sub: Subscriber = {
        id: data.id,
        address: data.address,
        name: data.name,
        email: data.email ?? undefined,
        joinedAt: data.created_at,
      };
      state.subscribers = [...state.subscribers.filter((s) => s.id !== sub.id), sub];
      emitChange();
      return sub;
    }
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
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from("organizers")
      .insert({ name: params.name, owner_address: params.address })
      .select()
      .single();

    if (!error && data) {
      const org: Organizer = {
        id: data.id,
        name: data.name,
        address: data.owner_address,
        totalDistributed: 0,
        subscriberCount: 0,
      };
      state.organizers = [...state.organizers, org];
      emitChange();
      return org;
    }
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

  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from("subscriptions")
      .insert({ organizer_id: organizerId, subscriber_id: subscriberId, status: "active" })
      .select()
      .single();

    if (!error && data) {
      subData = {
        id: data.id,
        organizerId: data.organizer_id,
        subscriberId: data.subscriber_id,
        status: data.status as "active",
        joinedAt: data.created_at,
      };

      // increment subscriber_count
      await supabase.rpc("increment_subscriber_count", { org_id: organizerId }).catch(() => {
        const org = state.organizers.find((o) => o.id === organizerId);
        if (org) {
          supabase.from("organizers").update({ subscriber_count: org.subscriberCount + 1 }).eq("id", organizerId);
        }
      });
    }
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
}): Promise<Payout> {
  const totalAmount = params.recipients.reduce((s, r) => s + r.amount, 0);
  const txHash = mockTxHash();

  let payout: Payout;
  let newPayments: Payment[] = [];

  if (isSupabaseConfigured) {
    const { data: payoutData, error: payoutError } = await supabase
      .from("payouts")
      .insert({
        organizer_id: params.organizerId,
        total_amount: totalAmount,
        status: "deposited",
        tx_hash: txHash,
      })
      .select()
      .single();

    if (!payoutError && payoutData) {
      payout = {
        id: payoutData.id,
        organizerId: payoutData.organizer_id,
        totalAmount: Number(payoutData.total_amount),
        status: "deposited",
        createdAt: payoutData.created_at,
        txHash,
      };

      const paymentInserts = params.recipients.map((r) => ({
        payout_id: payoutData.id,
        organizer_id: params.organizerId,
        subscriber_id: r.subscriberId,
        amount: r.amount,
        status: "claimable",
      }));

      const { data: paymentsData } = await supabase
        .from("payments")
        .insert(paymentInserts)
        .select();

      if (paymentsData) {
        newPayments = paymentsData.map((r) => ({
          id: r.id,
          payoutId: r.payout_id,
          organizerId: r.organizer_id,
          subscriberId: r.subscriber_id,
          amount: Number(r.amount),
          status: "claimable" as const,
        }));
      }

      // update organizer total_distributed
      const org = state.organizers.find((o) => o.id === params.organizerId);
      if (org) {
        const newTotal = org.totalDistributed + totalAmount;
        await supabase.from("organizers").update({ total_distributed: newTotal }).eq("id", params.organizerId);
      }
    } else {
      throw new Error(payoutError?.message ?? "Failed to create payout");
    }
  } else {
    // local-only fallback
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

  // update local state
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
  paymentId: string
): Promise<{ txHash: string }> {
  const txHash = mockTxHash();
  const now = new Date().toISOString();

  if (isSupabaseConfigured) {
    await supabase
      .from("payments")
      .update({ status: "claimed", claimed_at: now, tx_hash: txHash })
      .eq("id", paymentId);
  }

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
