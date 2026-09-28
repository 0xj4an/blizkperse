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
import {
  ArrowLeft,
  CircleDollarSign,
  Loader2,
} from "lucide-react";
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
import { hasRouter, getTokenBalance } from "@/lib/contracts";
import { formatInsufficientGasError } from "@/lib/alchemy";
import { useApiAuth } from "@/lib/api-auth";
import { useModal } from "@getpara/react-sdk";
import type { Hex } from "viem";

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
  const { walletClient, address, isReady } = useParaWalletClient();
  const apiAuth = useApiAuth();
  const { openModal } = useModal();

  useEffect(() => {
    if (orgFromStore) setCachedOrg(orgFromStore);
  }, [orgFromStore]);

  // Soft refetch on mount — tolerate AuthGuard cache rendering children before hydrate.
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

  const filtered = availableSubscribers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const payingIds = availableSubscribers
    .filter((s) => (amounts[s.id] || 0) > 0)
    .map((s) => s.id);

  const feePreview = (() => {
    const decimals = selectedToken.decimals;
    const applyFee = hasRouter(chain);
    const feeBps = applyFee ? PROTOCOL_FEE_BPS : 0;
    const ids = payingIds;
    const rawAmounts: bigint[] = [];
    for (const id of ids) {
      const human = amounts[id] || 0;
      if (human <= 0) continue;
      rawAmounts.push(toTokenRawAmount(human, decimals));
    }
    const netRaw = rawAmounts.reduce((a, b) => a + b, 0n);
    const feeRaw = applyFee
      ? rawAmounts.reduce((a, raw) => a + quoteProtocolFee(raw, feeBps), 0n)
      : 0n;
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
    if (filtered.length === 0) {
      toast.error("No one to pay yet.");
      return;
    }
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
    const ids = filtered.map((s) => s.id);
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
    if (filtered.length === 0) return;
    const next: Record<string, number> = {};
    filtered.forEach((s) => {
      next[s.id] = 1;
    });
    setAmounts(next);
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
    setProgressMsg("Generating ZK proof...");
    try {
      const result = await createPayout({
        organizerId: orgId,
        recipients: availableSubscribers
          .filter((s) => (amounts[s.id] || 0) > 0)
          .map((s) => ({
            subscriberId: s.id,
            amount: amounts[s.id] || 0,
          })),
        token: selectedToken.symbol,
        walletClient: walletClient ?? undefined,
        auth: { ...apiAuth, walletClient, address },
        chainConfig: chain,
        ownerAddress: address ?? undefined,
        onProgress: (step, current, total) => {
          const label =
            step === "Proving deposit"
              ? "Generating ZK proof"
              : step === "Depositing note"
                ? "Submitting deposit"
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
            ? "Deposit on-chain OK but note secrets were not saved. Do not re-deposit — reload this page to retry saving from local backup."
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
                1 each
              </Button>
            </div>
          </div>

          <Input
            placeholder="Find someone"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="divide-y divide-border rounded-xl border border-border">
            {filtered.map((s) => (
              <div key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.name}</p>
                  <p className="break-all font-mono text-[11px] leading-snug text-muted-foreground">
                    {s.address}
                  </p>
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
                      setAmounts({
                        ...amounts,
                        [s.id]: Number.isFinite(n) && n > 0 ? n : 0,
                      });
                    }}
                    className="w-full text-right sm:w-28"
                    aria-label={`Amount for ${s.name}`}
                  />
                  <span className="w-12 text-xs font-medium text-muted-foreground">
                    {selectedToken.symbol}
                  </span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No one to pay yet. Share a link from Send so people can join.
              </p>
            )}
          </div>

          <div className="space-y-1 rounded-xl border border-border p-4">
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
              <span className="text-xl font-semibold">
                {formatTokenAmount(feePreview.gross, selectedToken.symbol)}
              </span>
            </div>
          </div>

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
                {`Adjust to max (${formatTokenRaw(
                  balanceCheck.maxNetRaw,
                  selectedToken.decimals,
                  selectedToken.symbol,
                )})`}
              </Button>
            </div>
          )}

          <Button
            size="lg"
            className="w-full gap-2"
            onClick={isReady ? handleDeposit : () => openModal()}
            disabled={payingIds.length === 0 || Boolean(isReady && balanceCheck && !balanceCheck.ok)}
          >
            <CircleDollarSign className="h-5 w-5" />
            {isReady
              ? `Send ${formatTokenAmount(feePreview.gross, selectedToken.symbol)}`
              : "Log in to send"}
          </Button>
        </>
      )}
    </div>
  );
}
