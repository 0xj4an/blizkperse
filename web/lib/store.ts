"use client";

import { useSyncExternalStore } from "react";
import { BaseError, ContractFunctionRevertedError, type WalletClient, type Hex } from "viem";
import type { ChainConfig } from "./constants";
import {
  approvePoolToken,
  depositToPool,
  getDepositRevertReason,
  decodeRevertDataFromError,
  withdrawFromPool,
  getPublicClient,
  getTokenBalance,
  getPoolAllowance,
} from "./contracts";
import {
  createNote,
  addressToFieldPk,
  generateRandomField,
  bigintToBytes32,
  type ProofResult,
} from "./zk";
import { getWalletAuthHeaders } from "./api-auth";

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
  status: "pending" | "claimable" | "claimed" | "expired";
  claimedAt?: string;
  txHash?: string;
  /** Chain where the deposit note lives (from notes.chain_id). Used to filter claimable payments by network. */
  chainId?: number;
  /** Id of the note linked to this payment (for UI). */
  noteId?: string;
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

async function authedApi<T>(
  path: string,
  auth: { walletClient?: WalletClient | null; address?: string | null },
  opts?: RequestInit,
): Promise<T | null> {
  const authHeaders = await getWalletAuthHeaders(
    auth.walletClient ?? null,
    auth.address ?? null,
  );

  try {
    const res = await fetch(path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(opts?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Hydrate ──────────────────────────────────────────────

let hydratePromise: Promise<void> | null = null;

/** Force a fresh fetch from the API (e.g. so payment status matches DB). */
export function invalidateAndRefetchStore() {
  hydratePromise = null;
  hydrateStore();
}

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
      // API unavailable - start with empty state
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
      token: (r.token as string) ?? "USDC",
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
      chainId: r.chain_id != null ? Number(r.chain_id) : undefined,
      noteId: r.note_id != null ? String(r.note_id) : undefined,
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
  email?: string,
  walletClient?: WalletClient | null,
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
    { walletClient, address },
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
  walletClient?: WalletClient | null;
}): Promise<Organizer> {
  const data = await authedApi<Record<string, unknown>>(
    "/api/organizers",
    { walletClient: params.walletClient, address: params.address },
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
  };
  state.organizers = [...state.organizers, org];
  emitChange();
  return org;
}

export async function updateOrganizer(
  id: string,
  updates: { name: string },
  auth: { walletClient?: WalletClient | null; address?: string | null },
): Promise<Organizer> {
  const data = await authedApi<Record<string, unknown>>(
    `/api/organizers/${id}`,
    auth,
    {
    method: "PATCH",
    body: JSON.stringify(updates),
    },
  );
  if (!data) {
    throw new Error("Failed to update organizer");
  }

  state.organizers = state.organizers.map((o) =>
    o.id === id ? { ...o, name: data.name as string } : o
  );
  emitChange();
  return state.organizers.find((o) => o.id === id)!;
}

export async function deleteOrganizer(
  id: string,
  auth: { walletClient?: WalletClient | null; address?: string | null },
): Promise<void> {
  const authHeaders = await getWalletAuthHeaders(
    auth.walletClient ?? null,
    auth.address ?? null,
  );
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

export async function joinOrganizer(
  organizerId: string,
  subscriberId: string,
  auth: { walletClient?: WalletClient | null; address?: string | null },
): Promise<Subscription> {
  const data = await authedApi<Record<string, unknown>>(
    "/api/subscriptions",
    auth,
    {
    method: "POST",
    body: JSON.stringify({ organizer_id: organizerId, subscriber_id: subscriberId }),
    },
  );
  if (!data) {
    throw new Error("Failed to join organizer");
  }

  const subData: Subscription = {
    id: data.id as string,
    organizerId: data.organizer_id as string,
    subscriberId: data.subscriber_id as string,
    status: data.status as "active",
    joinedAt: data.created_at as string,
  };

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
  chainConfig: ChainConfig;
  /** If provided, we check balance before deposit and throw a clear error if insufficient. */
  ownerAddress?: Hex;
  onProgress?: (step: string, current: number, total: number) => void;
}): Promise<Payout> {
  const token = params.token ?? params.chainConfig.defaultToken.symbol;
  const expandedRecipients = params.recipients.flatMap((recipient) =>
    Array.from({ length: Math.floor(recipient.amount) }, () => ({
      subscriberId: recipient.subscriberId,
      amount: 1,
    })),
  );
  const totalNotes = expandedRecipients.length;
  const totalAmount = totalNotes;

  if (totalNotes === 0) {
    throw new Error("Payout must include at least one whole-token note");
  }

  const payoutSeed = await authedApi<{
    payout: Record<string, unknown>;
    payments: Array<Record<string, unknown>>;
  }>(
    "/api/payouts",
    { walletClient: params.walletClient, address: params.ownerAddress },
    {
      method: "POST",
      body: JSON.stringify({
        organizer_id: params.organizerId,
        total_amount: totalAmount,
        token,
        tx_hash: null,
        status: "pending",
        recipients: expandedRecipients.map((r) => ({
          subscriber_id: r.subscriberId,
          amount: r.amount,
        })),
      }),
    },
  );

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
  };

  const newPayments: Payment[] = payoutSeed.payments.map((r) => ({
    id: r.id as string,
    payoutId: r.payout_id as string,
    organizerId: r.organizer_id as string,
    subscriberId: r.subscriber_id as string,
    amount: Number(r.amount),
    status: r.status as Payment["status"],
  }));

  let txHash: string;

  // ── On-chain deposit flow ──────────────────────────────
  if (params.walletClient) {
    const publicClient = getPublicClient(params.chainConfig);
    const config = params.chainConfig;
    const required = BigInt(totalNotes) * config.poolDenomination;

    if (params.ownerAddress) {
      const balance = await getTokenBalance(config, params.ownerAddress, config.defaultToken);
      if (balance < required) {
        const symbol = config.defaultToken.symbol;
        const perNote = Number(config.poolDenomination) / Math.pow(10, config.defaultToken.decimals);
        throw new Error(
          `Insufficient ${symbol} balance on ${config.name}. You need at least ${totalNotes} ${symbol} (${perNote} ${symbol} per note).`
        );
      }
    }

    // Step 1: Approve only if current allowance is insufficient
    const requiredAllowance = BigInt(totalNotes) * config.poolDenomination;
    let lastTxHash: Hex | null = null;
    if (params.ownerAddress) {
      const currentAllowance = await getPoolAllowance(config, params.ownerAddress);
      if (currentAllowance < requiredAllowance) {
        params.onProgress?.("Approving token", 0, totalNotes);
        if (config.slug === "celo") {
          const resetTx = await approvePoolToken(params.walletClient, params.chainConfig, 0n);
          await publicClient.waitForTransactionReceipt({ hash: resetTx });
        }
        const approveTx = await approvePoolToken(
          params.walletClient,
          params.chainConfig,
          requiredAllowance,
        );
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        lastTxHash = approveTx;
      }
    } else {
      params.onProgress?.("Approving token", 0, totalNotes);
      if (config.slug === "celo") {
        const resetTx = await approvePoolToken(params.walletClient, params.chainConfig, 0n);
        await publicClient.waitForTransactionReceipt({ hash: resetTx });
      }
      const approveTx = await approvePoolToken(
        params.walletClient,
        params.chainConfig,
        requiredAllowance,
      );
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      lastTxHash = approveTx;
    }
    const approveTxHash = lastTxHash;

    // Step 2: Deposit notes one by one
    let noteIndex = 0;

    for (const [index, recipient] of expandedRecipients.entries()) {
      const sub = getSubscriberById(recipient.subscriberId);
      if (!sub) continue;

      const pk_b = addressToFieldPk(sub.address);
      noteIndex++;
      params.onProgress?.("Depositing note", noteIndex, totalNotes);

      const randomness = generateRandomField();
      const note = await createNote(1n, pk_b, randomness);
      const commitment = bigintToBytes32(note.commitment) as Hex;

      let depositTx: Hex;
      try {
        depositTx = await depositToPool(params.walletClient, config, commitment);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        let contractReason: string | null = decodeRevertDataFromError(err);
        if (!contractReason && err instanceof BaseError) {
          const revertErr = err.walk((e) => e instanceof ContractFunctionRevertedError);
          if (revertErr instanceof ContractFunctionRevertedError && revertErr.data?.args?.[0]) {
            contractReason = String(revertErr.data.args[0]);
          }
        }
        if (!contractReason && params.ownerAddress) {
          contractReason = await getDepositRevertReason(config, params.ownerAddress, commitment);
        }
        if (contractReason || msg.includes("revert") || msg.includes("unknown reason")) {
          const poolAddr = config.contracts.pool;
          const reasonLine = contractReason ? `Contract revert: "${contractReason}". ` : "";
          let detail = `Pool: ${poolAddr}. ${reasonLine}`;
          if (params.ownerAddress && !contractReason) {
            const allowance = await getPoolAllowance(config, params.ownerAddress);
            const need = requiredAllowance;
            detail += `Your allowance: ${allowance.toString()} (need ${need.toString()}). ${allowance < need ? "Approve more to the pool address above." : "Revert reason could not be decoded. Likely: 'transferFrom failed' (check balance, try approve 0 then approve amount) or 'commitment already used' (duplicate note)."}`;
          } else if (params.ownerAddress && contractReason === "transferFrom failed") {
            const balance = await getTokenBalance(config, params.ownerAddress, config.defaultToken);
            detail += `Your ${config.defaultToken.symbol} balance: ${balance.toString()}. The pool pulls exactly 1 ${config.defaultToken.symbol} per deposit; ensure you have enough and the token is not paused. Try approve(pool, 0) then approve(pool, amount) if you had a previous approval.`;
          } else if (params.ownerAddress && contractReason === "commitment already used") {
            detail += "This note was already deposited (e.g. duplicate or previous run). Create a new payout.";
          }
          throw new Error(`Deposit failed on ${config.name}. ${detail}`);
        }
        throw err;
      }
      await publicClient.waitForTransactionReceipt({ hash: depositTx });
      lastTxHash = depositTx;

      const payment = newPayments[index];
      if (!payment) {
        throw new Error("Missing payment record for deposited note");
      }
      const noteRow = await authedApi<Record<string, unknown>>(
        "/api/notes",
        { walletClient: params.walletClient, address: params.ownerAddress },
        {
          method: "POST",
          body: JSON.stringify({
            payment_id: payment.id,
            subscriber_id: recipient.subscriberId,
            chain_id: config.id,
            commitment: bigintToBytes32(note.commitment),
            value: bigintToBytes32(note.value),
            holder_pk: bigintToBytes32(note.holder),
            randomness: bigintToBytes32(note.random),
            nullifier: bigintToBytes32(note.nullifier),
          }),
        },
      );
      if (noteRow?.id) {
        payment.noteId = String(noteRow.id);
        payment.chainId = config.id;
      }
    }

    txHash = (lastTxHash ?? approveTxHash) ?? "";
  } else {
    // Fallback: mock tx hash when no wallet connected
    txHash = mockTxHash();
  }

  const finalizedPayout = await authedApi<Record<string, unknown>>(
    `/api/payouts/${payout.id}`,
    { walletClient: params.walletClient, address: params.ownerAddress },
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "deposited",
        tx_hash: txHash,
      }),
    },
  );

  if (!finalizedPayout) {
    throw new Error("Failed to finalize payout");
  }

  payout.status = finalizedPayout.status as Payout["status"];
  payout.txHash = (finalizedPayout.tx_hash as string) ?? txHash;
  newPayments.forEach((payment) => {
    payment.status = "claimable";
  });

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
  proofResult?: ProofResult,
  chainConfig?: ChainConfig,
  address?: string,
): Promise<{ txHash: string }> {
  let txHash: string;

  // ── On-chain withdraw flow ─────────────────────────────
  if (walletClient && proofResult && chainConfig) {
    const publicClient = getPublicClient(chainConfig);
    const pi = proofResult.publicInputs;
    const withdrawTx = await withdrawFromPool(walletClient, chainConfig, {
      proof: proofResult.proof,
      publicInputs: [
        pi.value,
        pi.nullifier,
        `0x${pi.merkleProofLength.toString(16).padStart(64, "0")}` as Hex,
        pi.expectedRoot,
        pi.recipient,
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: withdrawTx });
    txHash = withdrawTx;
  } else {
    txHash = mockTxHash();
  }

  const now = new Date().toISOString();

  const data = await authedApi<Record<string, unknown>>(
    `/api/payments/${paymentId}/claim`,
    { walletClient, address },
    {
      method: "PATCH",
      body: JSON.stringify({ tx_hash: txHash }),
    },
  );
  if (!data) {
    throw new Error("Failed to mark payment as claimed");
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
