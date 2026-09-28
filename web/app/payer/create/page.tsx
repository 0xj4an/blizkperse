"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TxStatus, type TxState } from "@/components/tx-status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WalletBalances } from "@/components/wallet-balances";
import { ArrowLeft, CircleDollarSign, Loader2 } from "lucide-react";
import {
  useStore,
  getSubscriberById,
  createPayout,
  invalidateAndRefetchStore,
  refetchStoreIfStale,
  flushPendingNoteSecrets,
  type Organizer,
} from "@/lib/store";
import { useParaWalletClient } from "@/lib/wallet";
import { useChain } from "@/lib/chain-context";
import type { ChainConfig, TokenConfig } from "@/lib/constants";
import {
  PROTOCOL_FEE_BPS,
  FEE_BPS_DENOM,
  toTokenRawAmount,
  quoteProtocolFee,
  quoteMaxNetFromBalance,
  scaleRawNotesToFitGross,
  fromTokenRawAmount,
  fromTokenRawAmountUi,
  formatTokenRawAmount,
  formatInsufficientDepositBalanceMessage,
} from "@/lib/constants";
import { hasRouter, getTokenBalance, poolDenominationCount, getPublicClient } from "@/lib/contracts";
import { formatInsufficientGasError } from "@/lib/alchemy";
import { useApiAuth } from "@/lib/api-auth";
import { useModal } from "@getpara/react-sdk";
import type { Hex } from "viem";
import {
  packHumanAmount,
  splitAutoMix,
  suggestPayable,
  formatPackPreview,
  ladderForToken,
  MAX_NOTES_PER_RECIPIENT,
  MAX_NOTES_PER_BATCH,
  type PackResult,
  type AutoMixSplit,
} from "@/lib/denominations";

type PrivacyMode = "standard" | "private" | "auto";

function usesBuckets(mode: PrivacyMode): boolean {
  return mode === "private" || mode === "auto";
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function hasLivePool(chain: ChainConfig, symbol: string): boolean {
  const pool = chain.pools[symbol]?.pool;
  return Boolean(pool && pool.toLowerCase() !== ZERO_ADDR);
}

function formatTokenAmount(amount: number, symbol: string): string {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${symbol}`;
}

function formatTokenRaw(raw: bigint, decimals: number, symbol: string): string {
  return `${formatTokenRawAmount(raw, decimals)} ${symbol}`;
}

function feeShortfallMessage(params: {
  symbol: string;
  decimals: number;
  haveRaw: bigint;
  netRaw: bigint;
  feeRaw: bigint;
  grossRaw: bigint;
  feePct: number;
  maxNetRaw: bigint;
}): string {
  return formatInsufficientDepositBalanceMessage({ ...params, withSymbol: true });
}

export default function CreatePayoutPage() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org") ?? "";
  const store = useStore();

  const orgFromStore = store.organizers.find((o) => o.id === orgId);
  // Survive transient empty store during post-deposit invalidate/refetch.
  const [cachedOrg, setCachedOrg] = useState<Organizer | null>(null);
  const org =
    orgFromStore ?? (cachedOrg?.id === orgId ? cachedOrg : null);

  const orgSubs = store.subscriptions.filter((s) => s.organizerId === orgId);
  const availableSubscribers = orgSubs
    .map((s) => getSubscriberById(s.subscriberId))
    .filter(Boolean) as NonNullable<ReturnType<typeof getSubscriberById>>[];

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<string>();
  const [progressMsg, setProgressMsg] = useState<string>();
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const { chain } = useChain();
  const selectableTokens = chain.tokens.filter((t) => hasLivePool(chain, t.symbol));
  const [selectedToken, setSelectedToken] = useState<TokenConfig>(
    () => selectableTokens.find((t) => t.symbol === chain.defaultToken.symbol) ?? selectableTokens[0] ?? chain.defaultToken,
  );
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>("standard");
  const [privatePoolReady, setPrivatePoolReady] = useState<boolean | null>(null);
  const { walletClient, address, isReady } = useParaWalletClient();
  const apiAuth = useApiAuth();
  const { openModal } = useModal();

  useEffect(() => {
    if (org && !org.privateEnabled && usesBuckets(privacyMode)) {
      setPrivacyMode("standard");
    }
  }, [org, privacyMode]);

  useEffect(() => {
    if (orgFromStore) setCachedOrg(orgFromStore);
  }, [orgFromStore]);

  // Soft refetch on mount  -  tolerate AuthGuard cache rendering children before hydrate.
  useEffect(() => {
    refetchStoreIfStale();
  }, []);

  useEffect(() => {
    const live = chain.tokens.filter((t) => hasLivePool(chain, t.symbol));
    setSelectedToken((prev) => {
      if (live.some((t) => t.symbol === prev.symbol)) return prev;
      return live.find((t) => t.symbol === chain.defaultToken.symbol) ?? live[0] ?? chain.defaultToken;
    });
  }, [chain]);

  useEffect(() => {
    if (!usesBuckets(privacyMode) || chain.placeholder) {
      setPrivatePoolReady(null);
      return;
    }
    let cancelled = false;
    setPrivatePoolReady(null);
    (async () => {
      try {
        const count = await poolDenominationCount(
          getPublicClient(chain),
          chain,
          selectedToken.symbol,
        );
        if (!cancelled) setPrivatePoolReady(count > 0);
      } catch {
        if (!cancelled) setPrivatePoolReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [privacyMode, chain, selectedToken.symbol]);

  useEffect(() => {
    if (!address || chain.placeholder) {
      setWalletBalance(null);
      return;
    }
    let cancelled = false;
    setWalletBalance(null);
    (async () => {
      try {
        const bal = await getTokenBalance(chain, address as Hex, selectedToken);
        if (!cancelled) setWalletBalance(bal);
      } catch {
        if (!cancelled) setWalletBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, chain, selectedToken]);

  const ladder = ladderForToken(selectedToken.symbol, selectedToken.decimals);

  const packByRecipient = (() => {
    const map = new Map<string, PackResult>();
    if (privacyMode !== "private") return map;
    for (const id of selected) {
      const human = amounts[id] || 0;
      if (human <= 0) continue;
      map.set(id, packHumanAmount(human, ladder));
    }
    return map;
  })();

  const autoMixByRecipient = (() => {
    const map = new Map<string, AutoMixSplit>();
    if (privacyMode !== "auto") return map;
    for (const id of selected) {
      const human = amounts[id] || 0;
      if (human <= 0) continue;
      const raw = toTokenRawAmount(human, selectedToken.decimals);
      map.set(id, splitAutoMix(raw, ladder));
    }
    return map;
  })();

  const privatePackStats = (() => {
    if (privacyMode !== "private") {
      return { ok: true, noteCount: 0, invalidIds: [] as string[] };
    }
    let noteCount = 0;
    const invalidIds: string[] = [];
    for (const id of selected) {
      const human = amounts[id] || 0;
      if (human <= 0) continue;
      const pack = packByRecipient.get(id);
      if (!pack || !pack.ok) invalidIds.push(id);
      else noteCount += pack.notes.length;
    }
    return {
      ok: invalidIds.length === 0 && noteCount > 0,
      noteCount,
      invalidIds,
    };
  })();

  const autoMixStats = (() => {
    if (privacyMode !== "auto") {
      return { noteCount: 0, privateNotes: 0, standardNotes: 0 };
    }
    let privateNotes = 0;
    let standardNotes = 0;
    for (const id of selected) {
      const split = autoMixByRecipient.get(id);
      if (!split) continue;
      privateNotes += split.privateNotes.length;
      if (split.standardRaw > 0n) standardNotes += 1;
    }
    return {
      noteCount: privateNotes + standardNotes,
      privateNotes,
      standardNotes,
    };
  })();

  const filtered = availableSubscribers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const feePreview = (() => {
    const decimals = selectedToken.decimals;
    const applyFee = hasRouter(chain);
    const feeBps = applyFee ? PROTOCOL_FEE_BPS : 0;
    const ids = Array.from(selected);
    const rawAmounts: bigint[] = [];
    for (const id of ids) {
      const human = amounts[id] || 0;
      if (human <= 0) continue;
      rawAmounts.push(toTokenRawAmount(human, decimals));
    }
    const netRaw = rawAmounts.reduce((a, b) => a + b, 0n);
    const feeRaw = (() => {
      if (!applyFee) return 0n;
      if (privacyMode === "private") {
        const noteRaws: bigint[] = [];
        for (const id of ids) {
          const pack = packByRecipient.get(id);
          if (pack?.ok) {
            for (const n of pack.notes) noteRaws.push(n.raw);
          } else {
            const human = amounts[id] || 0;
            if (human > 0) noteRaws.push(toTokenRawAmount(human, decimals));
          }
        }
        let fee = 0n;
        for (let i = 0; i < noteRaws.length; i += MAX_NOTES_PER_BATCH) {
          const chunk = noteRaws.slice(i, i + MAX_NOTES_PER_BATCH);
          fee += quoteProtocolFee(
            chunk.reduce((a, b) => a + b, 0n),
            feeBps,
          );
        }
        return fee;
      }
      if (privacyMode === "auto") {
        const privateRaws: bigint[] = [];
        const standardRaws: bigint[] = [];
        for (const id of ids) {
          const split = autoMixByRecipient.get(id);
          if (!split) continue;
          for (const n of split.privateNotes) privateRaws.push(n.raw);
          if (split.standardRaw > 0n) standardRaws.push(split.standardRaw);
        }
        let fee = 0n;
        for (let i = 0; i < privateRaws.length; i += MAX_NOTES_PER_BATCH) {
          const chunk = privateRaws.slice(i, i + MAX_NOTES_PER_BATCH);
          fee += quoteProtocolFee(
            chunk.reduce((a, b) => a + b, 0n),
            feeBps,
          );
        }
        for (const raw of standardRaws) {
          fee += quoteProtocolFee(raw, feeBps);
        }
        return fee;
      }
      return rawAmounts.reduce((a, raw) => a + quoteProtocolFee(raw, feeBps), 0n);
    })();
    const grossRaw = netRaw + feeRaw;
    return {
      ids,
      rawAmounts,
      netRaw,
      feeRaw,
      grossRaw,
      net: fromTokenRawAmount(netRaw, decimals),
      fee: fromTokenRawAmount(feeRaw, decimals),
      gross: fromTokenRawAmount(grossRaw, decimals),
      bps: feeBps,
      pct: feeBps / (FEE_BPS_DENOM / 100),
    };
  })();

  const balanceCheck = (() => {
    if (walletBalance === null || feePreview.grossRaw <= 0n) return null;
    const feeBps = feePreview.bps;
    const decimals = selectedToken.decimals;
    const maxNetRaw = quoteMaxNetFromBalance(walletBalance, feeBps);
    const ok = walletBalance >= feePreview.grossRaw;
    return {
      ok,
      haveRaw: walletBalance,
      netRaw: feePreview.netRaw,
      feeRaw: feePreview.feeRaw,
      grossRaw: feePreview.grossRaw,
      feePct: feePreview.pct,
      maxNetRaw,
      maxNet: fromTokenRawAmountUi(maxNetRaw, decimals),
      shortfallRaw: ok ? 0n : feePreview.grossRaw - walletBalance,
    };
  })();

  const handleEqualSplit = () => {
    const targetIds = filtered.map((s) => s.id);
    if (targetIds.length === 0) {
      toast.error("No one to pay yet.");
      return;
    }
    setSelected(new Set(targetIds));
    if (walletBalance === null) {
      toast.error("Wait for the wallet balance to load.");
      return;
    }
    if (walletBalance <= 0n) {
      toast.error(`${selectedToken.symbol} balance is zero.`);
      return;
    }

    const decimals = selectedToken.decimals;
    const feeBps = feePreview.bps;
    // Split spendable net (balance after reserving fee-on-top) across recipients.
    const maxNetRaw = quoteMaxNetFromBalance(walletBalance, feeBps);
    const ids = targetIds;
    const n = BigInt(ids.length);
    const base = maxNetRaw / n;
    if (base <= 0n) {
      toast.error("Balance too low to split after fee.");
      return;
    }

    const rawParts = ids.map(() => base);
    let rem = maxNetRaw % n;
    for (let i = 0; rem > 0n; i += 1, rem -= 1n) {
      rawParts[i]! += 1n;
    }

    const fitted =
      scaleRawNotesToFitGross(rawParts, walletBalance, feeBps) ?? rawParts;

    // Floor to UI-safe numbers so 18dp tokens (COPm) do not inflate on Number round-trip.
    let uiParts = fitted.map((r) => fromTokenRawAmountUi(r, decimals));
    let rawBack = uiParts.map((h) => toTokenRawAmount(h, decimals));
    const refit = scaleRawNotesToFitGross(rawBack, walletBalance, feeBps);
    if (refit) {
      uiParts = refit.map((r) => fromTokenRawAmountUi(r, decimals));
      rawBack = uiParts.map((h) => toTokenRawAmount(h, decimals));
    }

    if (privacyMode === "private") {
      const next: Record<string, number> = {};
      let adjusted = 0;
      ids.forEach((id, idx) => {
        const raw = toTokenRawAmount(uiParts[idx]!, decimals);
        const sug = suggestPayable(raw, ladder);
        if (sug.floor) {
          next[id] = fromTokenRawAmountUi(sug.floor.totalRaw, decimals);
          if (sug.floor.totalRaw !== raw) adjusted += 1;
        } else {
          next[id] = uiParts[idx]!;
        }
      });
      setAmounts(next);
      toast.success(
        adjusted > 0
          ? `Split then floored ${adjusted} amount(s) to exact Private buckets.`
          : `Evenly split into Private-packable amounts.`,
      );
      return;
    }

    const next: Record<string, number> = {};
    ids.forEach((id, idx) => {
      next[id] = uiParts[idx]!;
    });
    setAmounts(next);

    const netTotal = rawBack.reduce((a, r) => a + r, 0n);
    toast.success(
      `Evenly split spendable net (${formatTokenRaw(
        netTotal,
        decimals,
        selectedToken.symbol,
      )}).`,
    );
  };

  const handleOneEach = () => {
    const ids = filtered.map((s) => s.id);
    if (ids.length === 0) return;
    setSelected(new Set(ids));
    const next: Record<string, number> = {};
    if (usesBuckets(privacyMode)) {
      const smallest = ladder.descending[ladder.descending.length - 1];
      const human =
        typeof smallest?.human === "number"
          ? smallest.human
          : Number(smallest?.human ?? 1);
      ids.forEach((id) => {
        next[id] = human;
      });
    } else {
      ids.forEach((id) => {
        next[id] = 1;
      });
    }
    setAmounts(next);
  };

  const applyPackSuggestion = (id: string, kind: "floor" | "ceil") => {
    const human = amounts[id] || 0;
    if (human <= 0) return;
    const sug = suggestPayable(toTokenRawAmount(human, selectedToken.decimals), ladder);
    const pack = kind === "floor" ? sug.floor : sug.ceil;
    if (!pack) {
      toast.error(`No ${kind} bucket pack found for that amount.`);
      return;
    }
    setAmounts({
      ...amounts,
      [id]: fromTokenRawAmountUi(pack.totalRaw, selectedToken.decimals),
    });
  };

  const handleAdjustToMax = () => {
    if (walletBalance === null || feePreview.rawAmounts.length === 0) return;
    const decimals = selectedToken.decimals;
    const feeBps = feePreview.bps;
    const scaled = scaleRawNotesToFitGross(
      feePreview.rawAmounts,
      walletBalance,
      feeBps,
    );
    if (!scaled) {
      toast.error("Balance too low to cover any note plus fee.");
      return;
    }

    let uiParts = scaled.map((r) => fromTokenRawAmountUi(r, decimals));
    const rawBack = uiParts.map((h) => toTokenRawAmount(h, decimals));
    const refit = scaleRawNotesToFitGross(rawBack, walletBalance, feeBps);
    if (refit) {
      uiParts = refit.map((r) => fromTokenRawAmountUi(r, decimals));
    }

    const next: Record<string, number> = { ...amounts };
    let scaledIdx = 0;
    for (const id of feePreview.ids) {
      const human = amounts[id] || 0;
      if (human <= 0) continue;
      next[id] = uiParts[scaledIdx]!;
      scaledIdx += 1;
    }
    setAmounts(next);
    toast.success("Amounts adjusted so notes + fee fit your balance.");
  };

  const handleDeposit = async () => {
    if (privacyMode === "private") {
      if (privatePoolReady === false) {
        toast.error(
          `Private buckets are not configured on the ${selectedToken.symbol} pool yet.`,
        );
        return;
      }
      if (!privatePackStats.ok) {
        toast.error(
          "Every Private amount must pack into exact denomination buckets (use Floor / Ceil), or switch to Auto Mix.",
        );
        return;
      }
      if (privatePackStats.noteCount > MAX_NOTES_PER_BATCH * 8) {
        toast.error("Too many bucket notes for one payout. Split into smaller payouts.");
        return;
      }
    }
    if (privacyMode === "auto") {
      if (autoMixStats.noteCount === 0) {
        toast.error("Enter positive amounts to deposit.");
        return;
      }
      if (autoMixStats.noteCount > MAX_NOTES_PER_BATCH * 8) {
        toast.error("Too many notes for one payout. Split into smaller payouts.");
        return;
      }
    }
    if (balanceCheck && !balanceCheck.ok) {
      const msg = feeShortfallMessage({
        symbol: selectedToken.symbol,
        decimals: selectedToken.decimals,
        haveRaw: balanceCheck.haveRaw,
        netRaw: balanceCheck.netRaw,
        feeRaw: balanceCheck.feeRaw,
        grossRaw: balanceCheck.grossRaw,
        feePct: balanceCheck.feePct,
        maxNetRaw: balanceCheck.maxNetRaw,
      });
      toast.error(msg);
      return;
    }
    setTxState("pending");
    setProgressMsg(
      privacyMode === "private"
        ? "Generating ZK proofs for bucket notes..."
        : privacyMode === "auto"
          ? "Auto Mix: Private batch + Standard remainder..."
          : "Generating ZK proof...",
    );
    try {
      const result = await createPayout({
        organizerId: orgId,
        recipients: Array.from(selected).map((id) => ({
          subscriberId: id,
          amount: amounts[id] || 0,
        })),
        token: selectedToken.symbol,
        privacyMode,
        walletClient: walletClient ?? undefined,
        auth: { ...apiAuth, walletClient, address },
        chainConfig: chain,
        ownerAddress: address ?? undefined,
        onProgress: (step, current, total) => {
          const label =
            step === "Proving deposit"
              ? "Generating ZK proof"
              : step === "Depositing note"
                ? privacyMode === "private" || privacyMode === "auto"
                  ? "Submitting deposits"
                  : "Submitting deposit"
                : step === "Preparing payout"
                  ? "Preparing payout"
                  : step;
          setProgressMsg(
            total > 0 ? `${label} (${current}/${total})` : label,
          );
        },
      });
      setTxHash(result.txHash);
      setTxState("success");
      toast.success("Payout created successfully!");
    } catch (err) {
      setTxState("error");
      const gasMsg = formatInsufficientGasError(err);
      const msg = gasMsg ?? (err instanceof Error ? err.message : "Transaction failed");
      const cancelled = msg.includes("User rejected");
      const notesSaveFailed = msg.includes("saving note secrets failed");
      toast.error(
        cancelled
          ? "Transaction cancelled"
          : notesSaveFailed
            ? "Deposit on-chain OK but note secrets were not saved. Do not re-deposit  -  reload this page to retry saving from local backup."
            : msg,
      );
      // Partial success (some notes deposited) is persisted as claimable; refresh dashboard data.
      // Also retry flushing any localStorage-backed secrets after a notes POST failure.
      if (!cancelled) {
        if (notesSaveFailed) {
          try {
            await flushPendingNoteSecrets({ ...apiAuth, walletClient, address });
          } catch {
            // best-effort; toast already explained recovery
          }
        }
        invalidateAndRefetchStore();
      }
    }
  };

  // Don't treat transient empty store (initial load / post-mutation refetch) as missing org.
  if (!org) {
    if (!store.loaded || store.hydrating) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <div className="py-12 text-center text-muted-foreground">
        Organization not found.{" "}
        <Link href="/payer" className="text-foreground underline">
          Go back
        </Link>
      </div>
    );
  }

  const busy = txState === "pending" || txState === "success";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href="/payer">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </Link>
      <p className="text-sm text-muted-foreground">
        Paying <span className="font-medium text-foreground">{org.name}</span>
      </p>

      {busy || txState === "error" ? (
        <div className="space-y-6">
          <TxStatus
            state={txState}
            txHash={txHash}
            explorerUrl={chain.explorerUrl}
            successMessage="Sent. They can get paid now."
            progressMessage={progressMsg}
          />
          {txState === "success" && (
            <Link href="/payer">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
          )}
          {txState === "error" && (
            <Button variant="outline" onClick={() => setTxState("idle")}>
              Back to amounts
            </Button>
          )}
        </div>
      ) : (
        <>
          <WalletBalances address={address} highlightSymbol={selectedToken.symbol} />

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground" htmlFor="pay-token">Token</label>
                <Select
                  value={selectedToken.symbol}
                  onValueChange={(val) => {
                    const t = selectableTokens.find((token) => token.symbol === val);
                    if (t) setSelectedToken(t);
                  }}
                >
                  <SelectTrigger id="pay-token" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableTokens.map((t) => (
                      <SelectItem key={t.symbol} value={t.symbol}>
                        {t.symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleEqualSplit}>
                  Split evenly
                </Button>
                <Button variant="outline" size="sm" onClick={handleOneEach}>
                  {privacyMode === "private" || privacyMode === "auto" ? "Min each" : "1 each"}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap rounded-md border border-border p-0.5">
              <Button type="button" size="sm" variant={privacyMode === "standard" ? "default" : "ghost"} className="h-8 flex-1 px-3" onClick={() => setPrivacyMode("standard")}>
                Standard
              </Button>
              <Button
                type="button"
                size="sm"
                variant={privacyMode === "private" ? "default" : "ghost"}
                className="h-8 flex-1 px-3"
                disabled={!org.privateEnabled}
                title={org.privateEnabled ? "Fixed denomination buckets + depositBatch (exact amounts only)" : "Enable Private for this organization on Send"}
                onClick={() => {
                  if (!org.privateEnabled) {
                    toast.error("Enable Private for this organization on Send first.");
                    return;
                  }
                  setPrivacyMode("private");
                }}
              >
                Private
              </Button>
              <Button
                type="button"
                size="sm"
                variant={privacyMode === "auto" ? "default" : "ghost"}
                className="h-8 flex-1 px-3"
                disabled={!org.privateEnabled}
                title={org.privateEnabled ? "Pack into Private buckets; leftover goes to Standard automatically" : "Enable Private for this organization on Send"}
                onClick={() => {
                  if (!org.privateEnabled) {
                    toast.error("Enable Private for this organization on Send first.");
                    return;
                  }
                  setPrivacyMode("auto");
                }}
              >
                Auto Mix
              </Button>
            </div>
            {!org.privateEnabled && (
              <p className="text-xs text-muted-foreground">
                Private and Auto Mix stay off until you enable them for this group on Send.
              </p>
            )}
          </div>

          {privacyMode === "private" && (
            <div className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <p>
                Private mode packs each amount into fixed denomination buckets (max {MAX_NOTES_PER_RECIPIENT} notes / recipient) and deposits them in one depositBatch. Amounts must pack exactly. Use Floor, Ceil, or Auto Mix.
              </p>
              {privatePoolReady === false && (
                <p className="text-destructive">
                  This pool has no on-chain denominations yet. Private deposits fail until the deployer calls setDenominations.
                </p>
              )}
              {privatePoolReady === true && privatePackStats.noteCount > 0 && (
                <p>
                  Batch preview: <span className="font-medium text-foreground">{privatePackStats.noteCount} note{privatePackStats.noteCount === 1 ? "" : "s"}</span>
                  {!privatePackStats.ok && <span className="text-destructive">. Some amounts do not pack.</span>}
                </p>
              )}
            </div>
          )}

          {privacyMode === "auto" && (
            <div className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Auto Mix</span> packs as much as possible into Private buckets, then deposits any leftover as a Standard note. Recipients claim each note separately.
              </p>
              {privatePoolReady === false && (
                <p>
                  No on-chain denominations. This payout deposits <span className="font-medium text-foreground">all as Standard</span>.
                </p>
              )}
              {autoMixStats.noteCount > 0 && (
                <p>
                  Batch preview:{" "}
                  <span className="font-medium text-foreground">
                    {autoMixStats.privateNotes} Private + {autoMixStats.standardNotes} Standard
                  </span>
                </p>
              )}
            </div>
          )}

          <Input
            placeholder="Find someone"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="divide-y divide-border rounded-xl border border-border">
            {filtered.map((s) => {
              const human = amounts[s.id] || 0;
              const pack = packByRecipient.get(s.id);
              return (
                <div key={s.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{s.name}</p>
                      <p className="break-all font-mono text-[11px] leading-snug text-muted-foreground">{s.address}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        placeholder="0"
                        value={amounts[s.id] || ""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const amount = Number.isFinite(n) && n > 0 ? n : 0;
                          setAmounts({ ...amounts, [s.id]: amount });
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (amount > 0) next.add(s.id);
                            else next.delete(s.id);
                            return next;
                          });
                        }}
                        className="w-full text-right sm:w-28"
                        aria-label={`Amount for ${s.name}`}
                      />
                      <span className="w-12 text-xs font-medium text-muted-foreground">{selectedToken.symbol}</span>
                    </div>
                  </div>
                  {privacyMode === "private" && human > 0 && pack && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {pack.ok ? (
                        <span className="text-muted-foreground">
                          Pack: <span className="font-medium text-foreground">{formatPackPreview(pack.notes)}</span> ({pack.notes.length} note{pack.notes.length === 1 ? "" : "s"})
                        </span>
                      ) : (
                        <>
                          <span className="text-destructive">Cannot pack exactly ({pack.reason.replace(/_/g, " ")})</span>
                          <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => applyPackSuggestion(s.id, "floor")}>Floor</Button>
                          <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => applyPackSuggestion(s.id, "ceil")}>Ceil</Button>
                          <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => setPrivacyMode("auto")}>Use Auto Mix</Button>
                        </>
                      )}
                    </div>
                  )}
                  {privacyMode === "auto" && human > 0 && (() => {
                    const split = autoMixByRecipient.get(s.id);
                    if (!split) return null;
                    const stdHuman = fromTokenRawAmountUi(split.standardRaw, selectedToken.decimals);
                    return (
                      <p className="text-xs text-muted-foreground">
                        {split.privateNotes.length > 0 && (
                          <span>
                            Private: <span className="font-medium text-foreground">{formatPackPreview(split.privateNotes)}</span>
                            {" · "}
                          </span>
                        )}
                        {split.standardRaw > 0n ? (
                          <span>
                            Standard remainder: <span className="font-medium text-foreground">{stdHuman.toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedToken.symbol}</span>
                          </span>
                        ) : (
                          <span>Fully Private (exact pack)</span>
                        )}
                      </p>
                    );
                  })()}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No one to pay yet. Share a link from Send so people can join.
              </p>
            )}
          </div>

          <div className="space-y-1 rounded-xl border border-border p-4">
            {(privacyMode === "private" || privacyMode === "auto") && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Mode</span>
                <span className="font-medium text-foreground">
                  {privacyMode === "private"
                    ? `Private, ${privatePackStats.noteCount} bucket notes`
                    : `Auto Mix, ${autoMixStats.privateNotes} Private + ${autoMixStats.standardNotes} Standard`}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>People receive</span>
              <span>{formatTokenAmount(feePreview.net, selectedToken.symbol)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Fee ({feePreview.pct}%)</span>
              <span>{formatTokenAmount(feePreview.fee, selectedToken.symbol)}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm">You send</span>
              <span className="text-xl font-semibold">{formatTokenAmount(feePreview.gross, selectedToken.symbol)}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {privacyMode === "private"
              ? "Private amounts must match exact denomination buckets. Floor and Ceil adjust to the nearest packable total, or use Auto Mix."
              : privacyMode === "auto"
                ? "Auto Mix packs into Private buckets automatically. Any leftover deposits as a Standard note."
                : "Amounts use token decimals (for example 1.5 USDT or 5500 COPm). One payout uses a single token. For mixed tokens, create separate payouts."}
          </p>

          {balanceCheck && !balanceCheck.ok && (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <p>
                {feeShortfallMessage({
                  symbol: selectedToken.symbol,
                  decimals: selectedToken.decimals,
                  haveRaw: balanceCheck.haveRaw,
                  netRaw: balanceCheck.netRaw,
                  feeRaw: balanceCheck.feeRaw,
                  grossRaw: balanceCheck.grossRaw,
                  feePct: balanceCheck.feePct,
                  maxNetRaw: balanceCheck.maxNetRaw,
                })}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAdjustToMax}
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                {`Adjust to max (${formatTokenRaw(balanceCheck.maxNetRaw, selectedToken.decimals, selectedToken.symbol)})`}
              </Button>
            </div>
          )}

          <Button
            size="lg"
            className="w-full gap-2"
            onClick={isReady ? handleDeposit : () => openModal()}
            disabled={
              selected.size === 0 ||
              Boolean(isReady && balanceCheck && !balanceCheck.ok) ||
              (privacyMode === "private" && (!privatePackStats.ok || privatePoolReady === false))
            }
          >
            <CircleDollarSign className="h-5 w-5" />
            {isReady ? `Send ${formatTokenAmount(feePreview.gross, selectedToken.symbol)}` : "Log in to send"}
          </Button>
        </>
      )}
    </div>
  );
}
