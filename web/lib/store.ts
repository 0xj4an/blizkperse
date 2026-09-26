"use client";

import { useSyncExternalStore } from "react";
import { BaseError, ContractFunctionRevertedError, type WalletClient, type Hex } from "viem";
import {
  type ChainConfig,
  getPoolConfig,
  toTokenRawAmount,
  fromTokenRawAmountUi,
  quoteProtocolFee,
  quoteMaxNetFromBalance,
  formatInsufficientDepositBalanceMessage,
  PROTOCOL_FEE_BPS,
  FEE_BPS_DENOM,
} from "./constants";
import {
  approveRouterToken,
  depositNote,
  depositBatchNotes,
  hasRouter,
  getDepositRevertReason,
  decodeRevertDataFromError,
  withdrawFromPool,
  withdrawFromPoolViaSmartAccount,
  getPublicClient,
  getTokenBalance,
  getPoolAllowance,
  isNullifierAlreadyUsedError,
  isNullifierUsed,
  extractTxHashFromError,
  poolDenominationCount,
  type WithdrawSmartAccount,
} from "./contracts";
import {
  createNote,
  addressToFieldPk,
  generateRandomField,
  bigintToBytes32,
  generateDepositProof,
  type ProofResult,
} from "./zk";
import {
  packAmount,
  ladderForToken,
  MAX_NOTES_PER_BATCH,
} from "./denominations";
import {
  clearWalletAuthCache,
  getWalletAuthHeaders,
  type WalletAuth,
} from "./api-auth";
import {
  formatAlchemyPaymasterError,
  formatInsufficientGasError,
} from "./alchemy";

const PENDING_NOTES_STORAGE_KEY = "blizkperse-pending-note-secrets";

type PendingNoteSecret = {
  payment_id: string;
  subscriber_id: string;
  chain_id: number;
  commitment: string;
  value: string;
  holder_pk: string;
  randomness: string;
  nullifier: string;
  token_symbol: string;
  pool_address: string;
  /** Private buckets: on-chain denomination_id. Absent for Standard notes. */
  denomination_id?: number;
  deposit_tx?: string;
  savedAt: number;
};

function readPendingNoteSecrets(): PendingNoteSecret[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingNoteSecret[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingNoteSecrets(notes: PendingNoteSecret[]) {
  if (typeof window === "undefined") return;
  if (notes.length === 0) {
    localStorage.removeItem(PENDING_NOTES_STORAGE_KEY);
    return;
  }
  localStorage.setItem(PENDING_NOTES_STORAGE_KEY, JSON.stringify(notes));
}

function upsertPendingNoteSecret(note: PendingNoteSecret) {
  const existing = readPendingNoteSecrets().filter(
    (n) => n.payment_id !== note.payment_id && n.commitment !== note.commitment,
  );
  writePendingNoteSecrets([...existing, note]);
}

function removePendingNoteSecret(paymentId: string, commitment?: string) {
  writePendingNoteSecrets(
    readPendingNoteSecrets().filter((n) => {
      if (n.payment_id === paymentId) return false;
      if (commitment && n.commitment.toLowerCase() === commitment.toLowerCase()) {
        return false;
      }
      return true;
    }),
  );
}

/** True when localStorage has secrets that are safe to POST (deposit already confirmed). */
export function hasFlushablePendingNoteSecrets(): boolean {
  return readPendingNoteSecrets().some((n) => Boolean(n.deposit_tx));
}

/** Any local backup entries (with or without deposit_tx). */
export function hasAnyPendingNoteSecrets(): boolean {
  return readPendingNoteSecrets().length > 0;
}

/**
 * Safe peek for recovery UI/console — never returns holder_pk / randomness / nullifier.
 */
export function peekPendingNoteSecretsMeta(): Array<{
  payment_id: string;
  commitment_prefix: string;
  chain_id: number;
  has_deposit_tx: boolean;
  savedAt: number;
}> {
  return readPendingNoteSecrets().map((n) => ({
    payment_id: n.payment_id,
    commitment_prefix: n.commitment.slice(0, 14),
    chain_id: n.chain_id,
    has_deposit_tx: Boolean(n.deposit_tx),
    savedAt: n.savedAt,
  }));
}

/**
 * Attach a confirmed deposit tx to a pending local secret (recovery when the
 * pre-deposit draft was saved but the post-receipt upsert never ran).
 * Does not print or return secret fields.
 */
export function attachDepositTxToPendingNote(
  paymentId: string,
  depositTx: string,
  commitment?: string,
): boolean {
  const tx = depositTx.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(tx)) return false;
  const pending = readPendingNoteSecrets();
  let updated = false;
  const next = pending.map((n) => {
    const paymentMatch = n.payment_id === paymentId;
    const commitmentMatch = commitment
      ? n.commitment.toLowerCase() === commitment.trim().toLowerCase()
      : true;
    if (!paymentMatch || !commitmentMatch) return n;
    updated = true;
    return { ...n, deposit_tx: tx, savedAt: Date.now() };
  });
  if (updated) writePendingNoteSecrets(next);
  return updated;
}

/**
 * If exactly one pending secret exists, attach deposit_tx to it (console recovery).
 */
export function attachDepositTxToOnlyPendingNote(depositTx: string): boolean {
  const pending = readPendingNoteSecrets();
  if (pending.length !== 1) return false;
  return attachDepositTxToPendingNote(
    pending[0].payment_id,
    depositTx,
    pending[0].commitment,
  );
}

// ── Types ──────────────────────────────────────────────

export interface Organizer {
  id: string;
  name: string;
  address: string;
  totalDistributed: number;
  subscriberCount: number;
  /** When true, Create Payout may use Private buckets mode. */
  privateEnabled: boolean;
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
  status: "pending" | "deposited" | "distributed" | "claimed" | "failed";
  createdAt: string;
  txHash?: string;
  privacyMode?: "standard" | "private";
}

export interface Payment {
  id: string;
  payoutId: string;
  organizerId: string;
  subscriberId: string;
  amount: number;
  status: "pending" | "claimable" | "claimed" | "expired" | "failed";
  claimedAt?: string;
  txHash?: string;
  /** Chain where the deposit note lives (from notes.chain_id). Used to filter claimable payments by network. */
  chainId?: number;
  /** Id of the note linked to this payment (for UI). */
  noteId?: string;
  /** Confirmed via notes.deposit_tx or deposit_events_cache. */
  depositConfirmed?: boolean;
  depositTx?: string;
}

// ── Store (local cache, synced via API routes) ──────────

interface StoreState {
  organizers: Organizer[];
  subscribers: Subscriber[];
  subscriptions: Subscription[];
  payouts: Payout[];
  payments: Payment[];
  loaded: boolean;
  /** True while a hydrate fetch is in flight (keeps prior orgs visible). */
  hydrating: boolean;
}

let state: StoreState = {
  organizers: [],
  subscribers: [],
  subscriptions: [],
  payouts: [],
  payments: [],
  loaded: false,
  hydrating: false,
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

async function readApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // ignore non-JSON bodies
  }
  return res.statusText || `HTTP ${res.status}`;
}

async function authedFetch(
  path: string,
  auth: WalletAuth,
  opts?: RequestInit,
): Promise<Response> {
  const doFetch = async () => {
    const authHeaders = await getWalletAuthHeaders(auth);
    return fetch(path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(opts?.headers ?? {}),
      },
    });
  };

  let res = await doFetch();
  if (res.status === 401) {
    clearWalletAuthCache();
    res = await doFetch();
  }
  return res;
}

async function authedApi<T>(
  path: string,
  auth: WalletAuth,
  opts?: RequestInit,
): Promise<T | null> {
  try {
    const res = await authedFetch(path, auth, opts);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Like authedApi but throws with the API error body (for critical post-chain steps). */
async function authedApiOrThrow<T>(
  path: string,
  auth: WalletAuth,
  opts?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await authedFetch(path, auth, opts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error calling ${path}: ${msg}`);
  }
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${await readApiError(res)}`);
  }
  return res.json() as Promise<T>;
}

async function saveNoteSecretsWithRetry(
  auth: WalletAuth,
  body: PendingNoteSecret,
  attempts = 3,
): Promise<Record<string, unknown>> {
  if (!body.deposit_tx) {
    throw new Error("deposit_tx is required before saving note secrets");
  }
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const noteRow = await authedApiOrThrow<Record<string, unknown>>(
        "/api/notes",
        auth,
        {
          method: "POST",
          body: JSON.stringify({
            payment_id: body.payment_id,
            subscriber_id: body.subscriber_id,
            chain_id: body.chain_id,
            commitment: body.commitment,
            value: body.value,
            holder_pk: body.holder_pk,
            randomness: body.randomness,
            nullifier: body.nullifier,
            token_symbol: body.token_symbol,
            pool_address: body.pool_address,
            deposit_tx: body.deposit_tx,
            denomination_id: body.denomination_id ?? null,
          }),
        },
      );
      if (!noteRow?.id) {
        throw new Error("Notes API returned no id");
      }
      return noteRow;
    } catch (err) {
      lastErr = err;
      clearWalletAuthCache();
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Best-effort: flush note secrets left in localStorage after a prior crash.
 * Only posts notes that already have a confirmed deposit_tx — never promotes
 * pre-deposit local drafts into claimable DB rows.
 *
 * Also tries to backfill deposit_tx from the related payout.txHash in memory
 * when the post-receipt localStorage upsert never ran.
 */
export async function flushPendingNoteSecrets(auth: WalletAuth): Promise<number> {
  let pending = readPendingNoteSecrets();
  if (pending.length === 0) return 0;

  // Enrich drafts that lost deposit_tx but whose payout already recorded the hash.
  for (const note of pending) {
    if (note.deposit_tx) continue;
    const payment = state.payments.find((p) => p.id === note.payment_id);
    const payout = payment
      ? state.payouts.find((p) => p.id === payment.payoutId)
      : undefined;
    const tx = payout?.txHash?.trim().toLowerCase();
    if (tx && /^0x[0-9a-f]{64}$/.test(tx)) {
      attachDepositTxToPendingNote(note.payment_id, tx, note.commitment);
    }
  }
  pending = readPendingNoteSecrets();

  let saved = 0;
  for (const note of pending) {
    if (!note.deposit_tx) {
      // Still waiting for an on-chain deposit (or deposit never landed).
      // Drop stale pre-deposit drafts older than 2 hours so they cannot linger.
      const ageMs = Date.now() - (note.savedAt || 0);
      if (ageMs > 2 * 60 * 60 * 1000) {
        removePendingNoteSecret(note.payment_id, note.commitment);
      }
      continue;
    }
    try {
      await saveNoteSecretsWithRetry(auth, note);
      removePendingNoteSecret(note.payment_id, note.commitment);
      saved += 1;
    } catch (err) {
      console.error(
        "Failed to flush pending note secret",
        note.payment_id,
        note.commitment.slice(0, 12),
        err,
      );
    }
  }
  return saved;
}

/**
 * Mark the caller's claimable payments as claimed when nullifiers are already spent on-chain.
 */
export async function reconcileClaimedPayments(auth: WalletAuth): Promise<number> {
  try {
    const data = await authedApi<{ reconciled?: number }>(
      "/api/payments/reconcile",
      auth,
      { method: "POST" },
    );
    return Number(data?.reconciled ?? 0);
  } catch {
    return 0;
  }
}

/** True when local store already knows about claimable notes (skip reconcile RPC otherwise). */
export function hasClaimablePayments(subscriberId?: string): boolean {
  return state.payments.some(
    (p) =>
      p.status === "claimable" &&
      Boolean(p.noteId) &&
      (!subscriberId || p.subscriberId === subscriberId),
  );
}

// ── Hydrate ──────────────────────────────────────────────

/** Soft-refresh window: remounts reuse in-memory data within this TTL. */
const STORE_STALE_MS = 45_000;

let hydratePromise: Promise<void> | null = null;
let lastHydratedAt = 0;

/**
 * Soft refetch for page mounts — skips network if store is fresh.
 * Mutations that need a hard refresh should call invalidateAndRefetchStore().
 */
export function refetchStoreIfStale(staleMs: number = STORE_STALE_MS) {
  if (hydratePromise && state.hydrating) return hydratePromise;
  if (state.loaded && Date.now() - lastHydratedAt < staleMs) {
    return hydratePromise ?? Promise.resolve();
  }
  hydratePromise = null;
  return hydrateStore();
}

/** Force a fresh fetch from the API (e.g. after mutations so status matches DB). */
export function invalidateAndRefetchStore() {
  lastHydratedAt = 0;
  // Drop in-flight promise so a post-mutation refetch is not coalesced with a stale one.
  // The superseded run skips applying results (see hydrateStore).
  hydratePromise = null;
  return hydrateStore();
}

export function hydrateStore() {
  if (hydratePromise) return hydratePromise;
  const run = (async () => {
    state.hydrating = true;
    emitChange();

    try {
      const data = await api<{
        organizers: Array<Record<string, unknown>>;
        subscribers: Array<Record<string, unknown>>;
        subscriptions: Array<Record<string, unknown>>;
        payouts: Array<Record<string, unknown>>;
        payments: Array<Record<string, unknown>>;
      }>("/api/data");

      // Superseded by a newer invalidate/refetch that cleared hydratePromise.
      if (hydratePromise !== run) return;

      if (!data) {
        // Keep prior organizers/payments — never wipe to empty on a failed fetch.
        // Do not mark loaded / freshness on failure so mounts can retry via refetchStoreIfStale.
        return;
      }

      // Replace only after a successful response (no clear-then-fill gap).
      state.organizers = data.organizers.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        address: r.owner_address as string,
        totalDistributed: Number(r.total_distributed),
        subscriberCount: Number(r.subscriber_count),
        privateEnabled: Boolean(r.private_enabled),
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
        token: (r.token as string) ?? "USDC",
        status: r.status as Payout["status"],
        createdAt: r.created_at as string,
        txHash: (r.tx_hash as string) ?? undefined,
        privacyMode:
          r.privacy_mode === "private" ? "private" : "standard",
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
        chainId: r.chain_id != null ? Number(r.chain_id) : undefined,
        noteId: r.note_id != null ? String(r.note_id) : undefined,
        depositTx: (r.deposit_tx as string) ?? undefined,
        depositConfirmed:
          r.deposit_confirmed === true ||
          r.deposit_confirmed === "t" ||
          r.deposit_confirmed === "true",
      }));

      state.loaded = true;
      lastHydratedAt = Date.now();
    } finally {
      if (hydratePromise === run) {
        state.hydrating = false;
        emitChange();
      }
    }
  })();
  hydratePromise = run;
  return run;
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
  email?: string,
  auth?: WalletAuth,
): Promise<Subscriber> {
  const existing = getSubscriberByAddress(address);
  if (existing) return existing;

  const existingRemote = await api<Record<string, unknown>>(
    `/api/subscribers?address=${encodeURIComponent(address)}`,
  );
  if (existingRemote) {
    const sub: Subscriber = {
      id: existingRemote.id as string,
      address: existingRemote.address as string,
      name: existingRemote.name as string,
      email: (existingRemote.email as string) ?? undefined,
      joinedAt: existingRemote.created_at as string,
    };
    state.subscribers = [
      ...state.subscribers.filter((s) => s.id !== sub.id),
      sub,
    ];
    emitChange();
    return sub;
  }

  const displayName = name ?? `${address.slice(0, 6)}...${address.slice(-4)}`;

  const data = await authedApi<Record<string, unknown>>(
    "/api/subscribers",
    { ...auth, address },
    {
    method: "POST",
    body: JSON.stringify({ address, name: displayName, email }),
    },
  );

  if (!data) {
    throw new Error("Failed to create subscriber");
  }

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

export async function createOrganizer(params: {
  name: string;
  address: string;
  auth?: WalletAuth;
}): Promise<Organizer> {
  const data = await authedApi<Record<string, unknown>>(
    "/api/organizers",
    { ...params.auth, address: params.address },
    {
    method: "POST",
    body: JSON.stringify({ name: params.name, owner_address: params.address }),
    },
  );

  if (!data) {
    throw new Error("Failed to create organizer");
  }

  const org: Organizer = {
    id: data.id as string,
    name: data.name as string,
    address: data.owner_address as string,
    totalDistributed: 0,
    subscriberCount: 0,
    privateEnabled: Boolean(data.private_enabled),
  };
  state.organizers = [...state.organizers, org];
  emitChange();
  return org;
}

export async function updateOrganizer(
  id: string,
  updates: { name?: string; privateEnabled?: boolean },
  auth: WalletAuth,
): Promise<Organizer> {
  const body: Record<string, unknown> = {};
  if (updates.name !== undefined) body.name = updates.name;
  if (updates.privateEnabled !== undefined) {
    body.private_enabled = updates.privateEnabled;
  }
  const data = await authedApi<Record<string, unknown>>(
    `/api/organizers/${id}`,
    auth,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
  if (!data) {
    throw new Error("Failed to update organizer");
  }

  state.organizers = state.organizers.map((o) =>
    o.id === id
      ? {
          ...o,
          name: (data.name as string) ?? o.name,
          privateEnabled: Boolean(data.private_enabled),
        }
      : o,
  );
  emitChange();
  return state.organizers.find((o) => o.id === id)!;
}

export async function deleteOrganizer(
  id: string,
  auth: WalletAuth,
): Promise<void> {
  const authHeaders = await getWalletAuthHeaders(auth);
  const res = await fetch(`/api/organizers/${id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to delete organizer");
  }

  state.organizers = state.organizers.filter((o) => o.id !== id);
  state.payouts = state.payouts.filter((p) => p.organizerId !== id);
  state.payments = state.payments.filter((p) => p.organizerId !== id);
  state.subscriptions = state.subscriptions.filter((s) => s.organizerId !== id);
  emitChange();
}

export async function createInvite(
  organizerId: string,
  auth: WalletAuth,
  options?: { maxUses?: number },
): Promise<{
  code: string;
  joinPath: string;
  joinUrl: string;
  maxUses: number;
  useCount: number;
}> {
  const authHeaders = await getWalletAuthHeaders(auth);
  const maxUses =
    typeof options?.maxUses === "number" && Number.isFinite(options.maxUses)
      ? Math.min(1000, Math.max(1, Math.floor(options.maxUses)))
      : 1;
  const res = await fetch("/api/invites", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({ organizer_id: organizerId, max_uses: maxUses }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to create invite");
  }

  const code = body.code as string;
  const joinPath =
    (body.join_path as string) ?? `/receive?invite=${encodeURIComponent(code)}`;
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return {
    code,
    joinPath,
    joinUrl: origin ? `${origin}${joinPath}` : joinPath,
    maxUses: Number(body.max_uses ?? maxUses),
    useCount: Number(body.use_count ?? 0),
  };
}

export async function fetchInvite(code: string): Promise<{
  code: string;
  organizerId: string;
  organizerName: string;
  maxUses: number;
  useCount: number;
  remaining: number;
  used: boolean;
  expired: boolean;
  valid: boolean;
} | null> {
  const data = await api<{
    code: string;
    organizer_id: string;
    organizer_name: string;
    max_uses: number;
    use_count: number;
    remaining: number;
    used: boolean;
    expired: boolean;
    valid: boolean;
  }>(`/api/invites/${encodeURIComponent(code)}`);
  if (!data) return null;
  return {
    code: data.code,
    organizerId: data.organizer_id,
    organizerName: data.organizer_name,
    maxUses: Number(data.max_uses),
    useCount: Number(data.use_count),
    remaining: Number(data.remaining),
    used: data.used,
    expired: data.expired,
    valid: data.valid,
  };
}

export async function joinWithInvite(
  inviteCode: string,
  subscriberId: string,
  auth: WalletAuth,
  organizerHint?: { id: string; name: string; address?: string },
): Promise<Subscription> {
  const authHeaders = await getWalletAuthHeaders(auth);
  const res = await fetch("/api/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({
      invite_code: inviteCode,
      subscriber_id: subscriberId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to join with invite");
  }

  const subData: Subscription = {
    id: data.id as string,
    organizerId: data.organizer_id as string,
    subscriberId: data.subscriber_id as string,
    status: data.status as "active",
    joinedAt: data.created_at as string,
  };

  const alreadyCached = state.subscriptions.some((s) => s.id === subData.id);
  if (!alreadyCached) {
    state.subscriptions = [...state.subscriptions, subData];
  }

  let org = state.organizers.find((o) => o.id === subData.organizerId);
  if (!org && organizerHint && organizerHint.id === subData.organizerId) {
    org = {
      id: organizerHint.id,
      name: organizerHint.name,
      address: organizerHint.address ?? "",
      totalDistributed: 0,
      subscriberCount: 0,
      privateEnabled: false,
    };
    state.organizers = [...state.organizers, org];
  }
  if (org && !alreadyCached) {
    org.subscriberCount += 1;
    state.organizers = [...state.organizers];
  }

  emitChange();
  return subData;
}

/** @deprecated Open join is closed — use joinWithInvite. Kept for type compatibility. */
export async function joinOrganizer(
  _organizerId: string,
  subscriberId: string,
  auth: WalletAuth,
  inviteCode?: string,
): Promise<Subscription> {
  if (!inviteCode) {
    throw new Error("An invite code is required to join an organization");
  }
  return joinWithInvite(inviteCode, subscriberId, auth);
}

export async function createPayout(params: {
  organizerId: string;
  recipients: { subscriberId: string; amount: number }[];
  token?: string;
  walletClient?: WalletClient;
  auth?: WalletAuth;
  chainConfig: ChainConfig;
  /** If provided, we check balance before deposit and throw a clear error if insufficient. */
  ownerAddress?: Hex;
  onProgress?: (step: string, current: number, total: number) => void;
  /** Standard = one free-amount note per recipient. Private = fixed buckets + depositBatch. */
  privacyMode?: "standard" | "private";
}): Promise<Payout> {
  const privacyMode = params.privacyMode ?? "standard";
  const token = params.token ?? params.chainConfig.defaultToken.symbol;
  const poolCfg = getPoolConfig(params.chainConfig, token);
  const baseRecipients = params.recipients.filter((r) => r.amount > 0);
  const authOpts = {
    ...params.auth,
    walletClient: params.walletClient,
    address: params.ownerAddress,
  };

  if (baseRecipients.length === 0) {
    throw new Error("Payout must include at least one positive amount");
  }

  const config = params.chainConfig;
  const tokenCfg = poolCfg.token;

  type DepositItem = {
    subscriberId: string;
    amount: number;
    amountRaw: bigint;
    denominationId?: number;
  };

  let depositItems: DepositItem[];

  if (privacyMode === "private") {
    const org = state.organizers.find((o) => o.id === params.organizerId);
    if (org && !org.privateEnabled) {
      throw new Error(
        "Private mode is not enabled for this organization. Enable it in the payer dashboard first.",
      );
    }
    if (params.walletClient) {
      const denomCount = await poolDenominationCount(
        getPublicClient(config),
        config,
        token,
      );
      if (denomCount === 0) {
        throw new Error(
          `Private mode requires on-chain denominations on the ${token} pool (${poolCfg.pool}). Ask the deployer to call setDenominations.`,
        );
      }
    }
    const ladder = ladderForToken(token, tokenCfg.decimals);
    depositItems = [];
    for (const r of baseRecipients) {
      const amountRaw = toTokenRawAmount(r.amount, tokenCfg.decimals);
      const packed = packAmount(amountRaw, ladder);
      if (!packed.ok) {
        throw new Error(
          `Amount ${r.amount} ${token} for a recipient cannot be packed into Private buckets (${packed.reason}). Adjust to an exact bucket sum.`,
        );
      }
      for (const note of packed.notes) {
        depositItems.push({
          subscriberId: r.subscriberId,
          amount: fromTokenRawAmountUi(note.raw, tokenCfg.decimals),
          amountRaw: note.raw,
          denominationId: note.denominationId,
        });
      }
    }
  } else {
    depositItems = baseRecipients.map((r) => ({
      subscriberId: r.subscriberId,
      amount: r.amount,
      amountRaw: toTokenRawAmount(r.amount, tokenCfg.decimals),
    }));
  }

  const totalAmount = depositItems.reduce((sum, r) => sum + r.amount, 0);
  const totalNotes = depositItems.length;
  const rawAmounts = depositItems.map((r) => r.amountRaw);
  const netTotal = rawAmounts.reduce((a, b) => a + b, 0n);

  // Standard: fee per deposit tx. Private batch: fee per ≤64-note chunk on Σ.
  const feeTotal = (() => {
    if (!hasRouter(config)) return 0n;
    if (privacyMode === "private") {
      let fee = 0n;
      for (let i = 0; i < rawAmounts.length; i += MAX_NOTES_PER_BATCH) {
        const chunk = rawAmounts.slice(i, i + MAX_NOTES_PER_BATCH);
        fee += quoteProtocolFee(chunk.reduce((a, b) => a + b, 0n));
      }
      return fee;
    }
    return rawAmounts.reduce((a, raw) => a + quoteProtocolFee(raw), 0n);
  })();
  const required = netTotal + feeTotal;

  params.onProgress?.("Preparing payout", 0, totalNotes);

  // Balance check BEFORE creating DB rows so failed gas / insufficient-funds
  // attempts do not leave orphan pending payouts.
  if (params.walletClient && params.ownerAddress) {
    const balance = await getTokenBalance(config, params.ownerAddress, tokenCfg);
    if (balance < required) {
      const feeBps = hasRouter(config) ? PROTOCOL_FEE_BPS : 0;
      const feePct = PROTOCOL_FEE_BPS / (FEE_BPS_DENOM / 100);
      throw new Error(
        formatInsufficientDepositBalanceMessage({
          symbol: tokenCfg.symbol,
          decimals: tokenCfg.decimals,
          haveRaw: balance,
          netRaw: netTotal,
          feeRaw: feeTotal,
          grossRaw: required,
          feePct,
          maxNetRaw: quoteMaxNetFromBalance(balance, feeBps),
        }),
      );
    }
  }

  const payoutSeed = await authedApi<{
    payout: Record<string, unknown>;
    payments: Array<Record<string, unknown>>;
  }>("/api/payouts", authOpts, {
    method: "POST",
    body: JSON.stringify({
      organizer_id: params.organizerId,
      total_amount: totalAmount,
      token,
      tx_hash: null,
      status: "pending",
      privacy_mode: privacyMode,
      recipients: depositItems.map((r) => ({
        subscriber_id: r.subscriberId,
        amount: r.amount,
      })),
    }),
  });

  if (!payoutSeed) {
    throw new Error("Failed to create payout");
  }

  const payout: Payout = {
    id: payoutSeed.payout.id as string,
    organizerId: payoutSeed.payout.organizer_id as string,
    totalAmount: Number(payoutSeed.payout.total_amount),
    token: (payoutSeed.payout.token as string) ?? token,
    status: (payoutSeed.payout.status as Payout["status"]) ?? "pending",
    createdAt: payoutSeed.payout.created_at as string,
    txHash: (payoutSeed.payout.tx_hash as string) ?? undefined,
    privacyMode:
      payoutSeed.payout.privacy_mode === "private" ? "private" : "standard",
  };

  const newPayments: Payment[] = payoutSeed.payments.map((r) => ({
    id: r.id as string,
    payoutId: r.payout_id as string,
    organizerId: r.organizer_id as string,
    subscriberId: r.subscriber_id as string,
    amount: Number(r.amount),
    status: r.status as Payment["status"],
  }));

  let depositedCount = 0;
  let lastTxHash: Hex | null = null;
  let approveTxHash: Hex | null = null;

  const finalizePayoutStatus = async (status: "deposited" | "failed", txHash: string) => {
    return authedApi<Record<string, unknown>>(`/api/payouts/${payout.id}`, authOpts, {
      method: "PATCH",
      body: JSON.stringify({ status, tx_hash: txHash || null }),
    });
  };

  const commitSuccessfulPaymentsToStore = (finalized: Record<string, unknown>, txHash: string) => {
    payout.status = finalized.status as Payout["status"];
    payout.txHash = (finalized.tx_hash as string) ?? txHash;
    payout.totalAmount = Number(finalized.total_amount ?? payout.totalAmount);

    const kept = newPayments.filter((p) => p.status === "claimable");
    for (const payment of newPayments) {
      if (payment.status !== "claimable") payment.status = "failed";
    }

    const org = state.organizers.find((o) => o.id === params.organizerId);
    if (org) {
      org.totalDistributed += kept.reduce((sum, p) => sum + p.amount, 0);
      state.organizers = [...state.organizers];
    }

    state.payouts = [payout, ...state.payouts.filter((p) => p.id !== payout.id)];
    state.payments = [
      ...state.payments.filter((p) => p.payoutId !== payout.id),
      ...newPayments,
    ];
    emitChange();
  };

  try {
    // Recover any secrets left after a previous on-chain success / notes POST failure.
    await flushPendingNoteSecrets(authOpts).catch(() => 0);

    // ── On-chain deposit flow ──────────────────────────────
    if (params.walletClient) {
      const publicClient = getPublicClient(config);

      if (!tokenCfg.wrapsNative) {
        if (params.ownerAddress) {
          const currentAllowance = await getPoolAllowance(config, params.ownerAddress, tokenCfg);
          if (currentAllowance < required) {
            params.onProgress?.("Approving token", 0, totalNotes);
            if (config.slug === "celo") {
              const resetTx = await approveRouterToken(params.walletClient, config, tokenCfg, 0n);
              await publicClient.waitForTransactionReceipt({ hash: resetTx });
            }
            const approveTx = await approveRouterToken(
              params.walletClient,
              config,
              tokenCfg,
              required,
            );
            await publicClient.waitForTransactionReceipt({ hash: approveTx });
            lastTxHash = approveTx;
            approveTxHash = approveTx;
          }
        } else {
          params.onProgress?.("Approving token", 0, totalNotes);
          const approveTx = await approveRouterToken(
            params.walletClient,
            config,
            tokenCfg,
            required,
          );
          await publicClient.waitForTransactionReceipt({ hash: approveTx });
          lastTxHash = approveTx;
          approveTxHash = approveTx;
        }
      }

      if (privacyMode === "private") {
        // Prove all bucket notes, then one (or chunked) depositBatch.
        type PreparedNote = {
          payment: Payment;
          item: DepositItem;
          commitment: Hex;
          pendingSecret: PendingNoteSecret;
          proof: Hex;
          publicInputs: Hex[];
        };
        const prepared: PreparedNote[] = [];

        for (let index = 0; index < depositItems.length; index++) {
          const item = depositItems[index]!;
          const sub = getSubscriberById(item.subscriberId);
          if (!sub) continue;
          const payment = newPayments[index];
          if (!payment) throw new Error("Missing payment record for deposited note");
          if (item.denominationId === undefined) {
            throw new Error("Private deposit missing denominationId");
          }

          params.onProgress?.("Proving deposit", index + 1, totalNotes);

          const pk_b = addressToFieldPk(sub.address);
          const randomness = generateRandomField();
          const note = await createNote(item.amountRaw, pk_b, randomness);
          const commitment = bigintToBytes32(note.commitment) as Hex;
          const pendingSecret: PendingNoteSecret = {
            payment_id: payment.id,
            subscriber_id: item.subscriberId,
            chain_id: config.id,
            commitment: bigintToBytes32(note.commitment),
            value: bigintToBytes32(note.value),
            holder_pk: bigintToBytes32(note.holder),
            randomness: bigintToBytes32(note.random),
            nullifier: bigintToBytes32(note.nullifier),
            token_symbol: token,
            pool_address: poolCfg.pool,
            denomination_id: item.denominationId,
            savedAt: Date.now(),
          };
          upsertPendingNoteSecret(pendingSecret);

          const depositProof = await generateDepositProof({
            value: bigintToBytes32(note.value),
            commitment,
            pk_b: bigintToBytes32(note.holder),
            random: bigintToBytes32(note.random),
            nullifier: bigintToBytes32(note.nullifier),
          });

          prepared.push({
            payment,
            item,
            commitment,
            pendingSecret,
            proof: depositProof.proof,
            publicInputs: depositProof.publicInputs,
          });
        }

        if (prepared.length === 0) {
          throw new Error("No notes prepared for Private batch deposit");
        }

        params.onProgress?.("Depositing note", prepared.length, totalNotes);

        let batchHashes: Hex[];
        try {
          batchHashes = await depositBatchNotes(params.walletClient, config, {
            tokenSymbol: token,
            commitments: prepared.map((p) => p.commitment),
            denominationIds: prepared.map((p) => BigInt(p.item.denominationId!)),
            proofs: prepared.map((p) => p.proof),
            publicInputs: prepared.map((p) => p.publicInputs),
            totalNoteRaw: netTotal,
            useNative: Boolean(tokenCfg.wrapsNative),
          });
        } catch (err) {
          for (const p of prepared) {
            removePendingNoteSecret(p.payment.id, p.commitment);
          }
          const gasMsg = formatInsufficientGasError(err);
          if (gasMsg) throw new Error(gasMsg);
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(
            `Private depositBatch failed on ${config.name}. Pool: ${poolCfg.pool}. ${msg}`,
          );
        }

        for (const hash of batchHashes) {
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") {
            for (const p of prepared) {
              removePendingNoteSecret(p.payment.id, p.commitment);
            }
            throw new Error(`depositBatch reverted on-chain (${hash}).`);
          }
          lastTxHash = hash;
        }

        for (let index = 0; index < prepared.length; index++) {
          const p = prepared[index]!;
          const depositTx = batchHashes[Math.floor(index / MAX_NOTES_PER_BATCH)]!;
          upsertPendingNoteSecret({ ...p.pendingSecret, deposit_tx: depositTx });
          params.onProgress?.("Saving note secrets", index + 1, totalNotes);
          try {
            const noteRow = await saveNoteSecretsWithRetry(authOpts, {
              ...p.pendingSecret,
              deposit_tx: depositTx,
            });
            removePendingNoteSecret(p.payment.id, p.commitment);
            p.payment.noteId = String(noteRow.id);
          } catch (saveErr) {
            const saveMsg = saveErr instanceof Error ? saveErr.message : String(saveErr);
            throw new Error(
              `On-chain deposit succeeded but saving note secrets failed. Do not retry the same note; recover secrets before another deposit. payment=${p.payment.id} commitment=${p.commitment} tx=${depositTx}. Secrets are in localStorage (${PENDING_NOTES_STORAGE_KEY}). Cause: ${saveMsg}`,
            );
          }
          p.payment.chainId = config.id;
          p.payment.status = "claimable";
          depositedCount += 1;
        }
      } else {
        let noteIndex = 0;

        for (const [index, item] of depositItems.entries()) {
          const sub = getSubscriberById(item.subscriberId);
          if (!sub) continue;

          const amountRaw = item.amountRaw;
          noteIndex++;
          params.onProgress?.("Proving deposit", noteIndex, totalNotes);

          const payment = newPayments[index];
          if (!payment) {
            throw new Error("Missing payment record for deposited note");
          }

          const pk_b = addressToFieldPk(sub.address);
          const randomness = generateRandomField();
          const note = await createNote(amountRaw, pk_b, randomness);
          const commitment = bigintToBytes32(note.commitment) as Hex;
          const pendingSecret: PendingNoteSecret = {
            payment_id: payment.id,
            subscriber_id: item.subscriberId,
            chain_id: config.id,
            commitment: bigintToBytes32(note.commitment),
            value: bigintToBytes32(note.value),
            holder_pk: bigintToBytes32(note.holder),
            randomness: bigintToBytes32(note.random),
            nullifier: bigintToBytes32(note.nullifier),
            token_symbol: token,
            pool_address: poolCfg.pool,
            savedAt: Date.now(),
          };
          // Local draft BEFORE the chain tx (crash recovery). Must NOT be flushed to
          // DB until deposit_tx is set after a successful receipt — see flushPendingNoteSecrets.
          upsertPendingNoteSecret(pendingSecret);

          const depositProof = await generateDepositProof({
            value: bigintToBytes32(note.value),
            commitment,
            pk_b: bigintToBytes32(note.holder),
            random: bigintToBytes32(note.random),
            nullifier: bigintToBytes32(note.nullifier),
          });

          params.onProgress?.("Depositing note", noteIndex, totalNotes);

          let depositTx: Hex;
          try {
            depositTx = await depositNote(params.walletClient, config, {
              tokenSymbol: token,
              commitment,
              amount: amountRaw,
              proof: depositProof.proof,
              publicInputs: depositProof.publicInputs,
              useNative: Boolean(tokenCfg.wrapsNative),
            });
          } catch (err) {
            removePendingNoteSecret(payment.id, commitment);
            const gasMsg = formatInsufficientGasError(err);
            if (gasMsg) throw new Error(gasMsg);

            const msg = err instanceof Error ? err.message : String(err);
            let contractReason: string | null = decodeRevertDataFromError(err);
            if (!contractReason && err instanceof BaseError) {
              const revertErr = err.walk((e) => e instanceof ContractFunctionRevertedError);
              if (revertErr instanceof ContractFunctionRevertedError && revertErr.data?.args?.[0]) {
                contractReason = String(revertErr.data.args[0]);
              }
            }
            if (!contractReason && params.ownerAddress) {
              contractReason = await getDepositRevertReason(
                config,
                params.ownerAddress,
                commitment,
                amountRaw,
                depositProof.proof,
                depositProof.publicInputs,
                token,
              );
            }
            if (contractReason || msg.includes("revert") || msg.includes("unknown reason")) {
              throw new Error(
                `Deposit failed on ${config.name}. Pool: ${poolCfg.pool}. Router: ${config.router}. ${contractReason ? `Contract revert: "${contractReason}". ` : ""}${msg}`,
              );
            }
            throw err;
          }
          const depositReceipt = await publicClient.waitForTransactionReceipt({
            hash: depositTx,
          });
          if (depositReceipt.status !== "success") {
            removePendingNoteSecret(payment.id, commitment);
            throw new Error(
              `Deposit transaction reverted on-chain (${depositTx}). Note was not registered.`,
            );
          }
          lastTxHash = depositTx;
          upsertPendingNoteSecret({ ...pendingSecret, deposit_tx: depositTx });

          params.onProgress?.("Saving note secrets", noteIndex, totalNotes);
          try {
            const noteRow = await saveNoteSecretsWithRetry(authOpts, {
              ...pendingSecret,
              deposit_tx: depositTx,
            });
            removePendingNoteSecret(payment.id, commitment);
            payment.noteId = String(noteRow.id);
          } catch (saveErr) {
            const saveMsg = saveErr instanceof Error ? saveErr.message : String(saveErr);
            throw new Error(
              `On-chain deposit succeeded but saving note secrets failed. Do not retry the same note; recover secrets before another deposit. payment=${payment.id} commitment=${commitment} tx=${depositTx}. Secrets are in localStorage (${PENDING_NOTES_STORAGE_KEY}). Cause: ${saveMsg}`,
            );
          }
          payment.chainId = config.id;
          payment.status = "claimable";
          depositedCount += 1;
        }
      }
    } else {
      // Fallback: mock tx hash when no wallet connected
      lastTxHash = mockTxHash() as Hex;
      for (const payment of newPayments) {
        payment.status = "claimable";
        depositedCount += 1;
      }
    }

    const txHash = (lastTxHash ?? approveTxHash) ?? "";
    const finalizedPayout = await finalizePayoutStatus("deposited", txHash);
    if (!finalizedPayout) {
      throw new Error("Failed to finalize payout");
    }

    commitSuccessfulPaymentsToStore(finalizedPayout, txHash);
    return payout;
  } catch (err) {
    const isNotesSaveFailure =
      err instanceof Error && err.message.includes("saving note secrets failed");

    // Deposit landed but notes POST failed: leave payout/payments pending so
    // flushPendingNoteSecrets (localStorage) can still recover without re-depositing.
    if (isNotesSaveFailure) {
      throw err;
    }

    const txHash = (lastTxHash ?? approveTxHash) ?? "";
    const finalizeStatus = depositedCount > 0 ? "deposited" : "failed";
    const finalized = await finalizePayoutStatus(finalizeStatus, txHash).catch(() => null);

    if (depositedCount > 0 && finalized) {
      // Keep successful on-chain notes claimable; surface the partial failure to the UI.
      commitSuccessfulPaymentsToStore(finalized, txHash);
    } else if (finalized) {
      payout.status = "failed";
      for (const payment of newPayments) {
        if (payment.status !== "claimable") payment.status = "failed";
      }
      state.payouts = [payout, ...state.payouts.filter((p) => p.id !== payout.id)];
      state.payments = [
        ...state.payments.filter((p) => p.payoutId !== payout.id),
        ...newPayments,
      ];
      emitChange();
    }

    // Approve / estimateGas can also fail with insufficient native for gas.
    const gasMsg = formatInsufficientGasError(err);
    if (gasMsg) throw new Error(gasMsg);
    throw err;
  }
}

export async function claimPayment(
  paymentId: string,
  walletClient?: WalletClient,
  proofResult?: ProofResult,
  chainConfig?: ChainConfig,
  auth?: WalletAuth,
  tokenSymbol?: string,
  /** When set (Alchemy AA ready), prefer sponsored UserOperation withdraw; else EOA walletClient. */
  smartAccount?: WithdrawSmartAccount | null,
): Promise<{ txHash: string }> {
  let txHash: string;

  // ── On-chain withdraw flow ─────────────────────────────
  if (proofResult && chainConfig && (smartAccount || walletClient)) {
    const pi = proofResult.publicInputs;
    const mode = proofResult.mode ?? "standard";
    const publicInputs: Hex[] = [
      pi.value,
      pi.nullifier,
      `0x${pi.merkleProofLength.toString(16).padStart(64, "0")}` as Hex,
      pi.expectedRoot,
      pi.recipient,
    ];
    const withdrawParams = {
      proof: proofResult.proof,
      publicInputs,
      tokenSymbol: tokenSymbol ?? chainConfig.defaultToken.symbol,
      mode,
    };

    try {
      if (smartAccount) {
        try {
          txHash = await withdrawFromPoolViaSmartAccount(
            smartAccount,
            chainConfig,
            withdrawParams,
          );
        } catch (err) {
          const nullifier = publicInputs[1];
          const onChainUsed = await isNullifierUsed(
            chainConfig,
            nullifier,
            withdrawParams.tokenSymbol,
          ).catch(() => false);
          if (isNullifierAlreadyUsedError(err) || onChainUsed) {
            txHash = extractTxHashFromError(err) ?? "";
          } else {
            throw err;
          }
        }
      } else {
        const publicClient = getPublicClient(chainConfig);
        const withdrawTx = await withdrawFromPool(walletClient!, chainConfig, withdrawParams);
        const withdrawReceipt = await publicClient.waitForTransactionReceipt({
          hash: withdrawTx,
        });
        if (withdrawReceipt.status !== "success") {
          throw new Error(`Withdraw transaction reverted on-chain (${withdrawTx})`);
        }
        txHash = withdrawTx;
      }
    } catch (err) {
      // AA path: paymaster failures are already mapped in withdrawFromPoolViaSmartAccount.
      // Re-check here in case a wrapped error still carries Gas Manager signals.
      if (smartAccount) {
        const paymasterMsg = formatAlchemyPaymasterError(err);
        if (paymasterMsg) throw new Error(paymasterMsg);
      }
      const gasMsg = formatInsufficientGasError(err, "claim");
      if (gasMsg) throw new Error(gasMsg);
      throw err;
    }
  } else {
    txHash = mockTxHash();
  }

  const now = new Date().toISOString();

  // Prefer throwing API errors so a successful on-chain withdraw still surfaces
  // DB sync failures (and claim route can reconcile via nullifier on retry).
  await authedApiOrThrow<Record<string, unknown>>(
    `/api/payments/${paymentId}/claim`,
    { ...auth, walletClient },
    {
      method: "PATCH",
      body: JSON.stringify({ tx_hash: txHash || null }),
    },
  );

  const payment = state.payments.find((p) => p.id === paymentId);
  if (payment) {
    payment.status = "claimed";
    payment.claimedAt = now;
    payment.txHash = txHash;
    state.payments = [...state.payments];

    const siblings = state.payments.filter((p) => p.payoutId === payment.payoutId);
    const anyClaimed = siblings.some((p) => p.status === "claimed");
    const allDone = siblings.every(
      (p) => p.status === "claimed" || p.status === "failed" || p.status === "expired",
    );
    if (anyClaimed && allDone) {
      const payout = state.payouts.find((p) => p.id === payment.payoutId);
      if (payout && (payout.status === "deposited" || payout.status === "distributed")) {
        payout.status = "claimed";
        state.payouts = [...state.payouts];
      }
    }
    emitChange();
  }

  return { txHash };
}

/** Download institutional audit pack JSON for a payout (owner only). */
export async function downloadPayoutAuditPack(
  payoutId: string,
  auth: WalletAuth,
): Promise<{ filename: string; payload: unknown }> {
  const data = await authedApiOrThrow<Record<string, unknown>>(
    `/api/payouts/${payoutId}/audit`,
    auth,
    { method: "GET" },
  );
  return {
    filename: `blizkperse-audit-${payoutId.slice(0, 8)}.json`,
    payload: data,
  };
}
