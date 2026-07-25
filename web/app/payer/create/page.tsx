"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  ArrowRight,
  Users,
  CircleDollarSign,
  Check,
} from "lucide-react";
import {
  useStore,
  getSubscriberById,
  createPayout,
  invalidateAndRefetchStore,
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
} from "@/lib/constants";
import { hasRouter, getTokenBalance } from "@/lib/contracts";
import { useApiAuth } from "@/lib/api-auth";
import { useModal } from "@getpara/react-sdk";
import type { Hex } from "viem";

type Step = "select" | "amounts" | "review";

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

function isSpanishUi(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.language.toLowerCase().startsWith("es");
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
  const { symbol, decimals, haveRaw, netRaw, feeRaw, grossRaw, feePct, maxNetRaw } =
    params;
  const have = formatTokenRaw(haveRaw, decimals, symbol);
  const net = formatTokenRaw(netRaw, decimals, symbol);
  const fee = formatTokenRaw(feeRaw, decimals, symbol);
  const gross = formatTokenRaw(grossRaw, decimals, symbol);
  const maxNet = formatTokenRaw(maxNetRaw, decimals, symbol);
  if (isSpanishUi()) {
    return `Saldo insuficiente: tienes ${have}. Notas (neto): ${net}. Comisión (${feePct}%): ${fee}. Bruto requerido (notas + comisión): ${gross}. Reduce las notas a ≤ ${maxNet} o recarga la diferencia.`;
  }
  return `Insufficient balance: you have ${have}. Notes (net): ${net}. Fee (${feePct}%): ${fee}. Gross required (notes + fee): ${gross}. Reduce notes to ≤ ${maxNet} or top up the difference.`;
}

export default function CreatePayoutPage() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org") ?? "";
  const store = useStore();

  const org = store.organizers.find((o) => o.id === orgId);
  const orgSubs = store.subscriptions.filter((s) => s.organizerId === orgId);
  const availableSubscribers = orgSubs
    .map((s) => getSubscriberById(s.subscriberId))
    .filter(Boolean) as NonNullable<ReturnType<typeof getSubscriberById>>[];

  const [step, setStep] = useState<Step>("select");
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
  const { walletClient, address, isReady } = useParaWalletClient();
  const apiAuth = useApiAuth();
  const { openModal } = useModal();

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

  const totalAmount = Array.from(selected).reduce(
    (sum, id) => sum + (amounts[id] || 0),
    0
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

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
  };

  const handleEqualSplit = () => {
    if (selected.size === 0) {
      toast.error(
        isSpanishUi()
          ? "Selecciona al menos un destinatario."
          : "Select at least one recipient.",
      );
      return;
    }
    if (walletBalance === null) {
      toast.error(
        isSpanishUi()
          ? "Espera a que cargue el saldo de la wallet."
          : "Wait for the wallet balance to load.",
      );
      return;
    }
    if (walletBalance <= 0n) {
      toast.error(
        isSpanishUi()
          ? `Saldo de ${selectedToken.symbol} en cero.`
          : `${selectedToken.symbol} balance is zero.`,
      );
      return;
    }

    const decimals = selectedToken.decimals;
    const feeBps = feePreview.bps;
    // Split spendable net (balance after reserving fee-on-top) across recipients.
    const maxNetRaw = quoteMaxNetFromBalance(walletBalance, feeBps);
    const ids = Array.from(selected);
    const n = BigInt(ids.length);
    const base = maxNetRaw / n;
    if (base <= 0n) {
      toast.error(
        isSpanishUi()
          ? "El saldo no alcanza para repartir con comisión."
          : "Balance too low to split after fee.",
      );
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
      isSpanishUi()
        ? `Reparto equitativo del neto disponible (${formatTokenRaw(
            netTotal,
            decimals,
            selectedToken.symbol,
          )}).`
        : `Evenly split spendable net (${formatTokenRaw(
            netTotal,
            decimals,
            selectedToken.symbol,
          )}).`,
    );
  };

  const handleOneEach = () => {
    if (selected.size === 0) return;
    const next: Record<string, number> = {};
    selected.forEach((id) => {
      next[id] = 1;
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
      toast.error(
        isSpanishUi()
          ? "El saldo no alcanza ni para una nota con comisión."
          : "Balance too low to cover any note plus fee.",
      );
      return;
    }

    let uiParts = scaled.map((r) => fromTokenRawAmountUi(r, decimals));
    let rawBack = uiParts.map((h) => toTokenRawAmount(h, decimals));
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
    toast.success(
      isSpanishUi()
        ? "Montos ajustados para que notas + comisión quepan en tu saldo."
        : "Amounts adjusted so notes + fee fit your balance.",
    );
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
    setProgressMsg("Preparing deposit...");
    try {
      const result = await createPayout({
        organizerId: orgId,
        recipients: Array.from(selected).map((id) => ({
          subscriberId: id,
          amount: amounts[id] || 0,
        })),
        token: selectedToken.symbol,
        walletClient: walletClient ?? undefined,
        auth: { ...apiAuth, walletClient, address },
        chainConfig: chain,
        ownerAddress: address ?? undefined,
        onProgress: (step, current, total) => {
          setProgressMsg(`${step} (${current}/${total})`);
        },
      });
      setTxHash(result.txHash);
      setTxState("success");
      toast.success("Payout created successfully!");
    } catch (err) {
      setTxState("error");
      const msg = err instanceof Error ? err.message : "Transaction failed";
      const cancelled = msg.includes("User rejected");
      toast.error(
        cancelled
          ? "Transaction cancelled"
          : msg,
      );
      // Partial success (some notes deposited) is persisted as claimable; refresh dashboard data.
      if (!cancelled) {
        invalidateAndRefetchStore();
      }
    }
  };

  if (!org) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Organization not found.{" "}
        <Link href="/payer" className="text-foreground underline">
          Go back
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Creating payout for <span className="font-medium text-foreground">{org.name}</span>
      </p>

      {/* Step Indicator */}
      <div className="flex items-center gap-3">
        {(["select", "amounts", "review"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : (["select", "amounts", "review"].indexOf(step) > i)
                    ? "bg-foreground/10 text-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {["select", "amounts", "review"].indexOf(step) > i ? (
                <Check className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < 2 && (
              <div className="h-px w-8 bg-border md:w-16" />
            )}
          </div>
        ))}
        <span className="ml-2 text-sm text-muted-foreground capitalize">
          {step === "select"
            ? "Select Subscribers"
            : step === "amounts"
              ? "Set Amounts"
              : "Review & Deposit"}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {step === "select" && (
          <motion.div
            key="select"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search subscribers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {selected.size === filtered.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
              <Badge variant="secondary">{selected.size} selected</Badge>
            </div>

            <Card>
              <CardContent className="divide-y divide-border p-0">
                {filtered.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selected.has(s.id)}
                      onCheckedChange={() => toggleSelect(s.id)}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{s.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {s.address.slice(0, 6)}...{s.address.slice(-4)}
                      </p>
                    </div>
                  </label>
                ))}
                {filtered.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No subscribers found.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={() => setStep("amounts")}
                disabled={selected.size === 0}
                className="gap-2"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === "amounts" && (
          <motion.div
            key="amounts"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            <WalletBalances
              address={address}
              highlightSymbol={selectedToken.symbol}
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground">Token</label>
                <Select
                  value={selectedToken.symbol}
                  onValueChange={(val) => {
                    const t = selectableTokens.find((t) => t.symbol === val);
                    if (t) setSelectedToken(t);
                  }}
                >
                  <SelectTrigger className="w-32">
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
                {selectableTokens.length < 2 && (
                  <span className="text-xs text-muted-foreground">
                    Only tokens with a live pool on {chain.name} are listed.
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEqualSplit}
                  title={
                    isSpanishUi()
                      ? "Reparte el neto disponible (saldo menos comisión) entre los seleccionados"
                      : "Split spendable net (balance after fee) across selected recipients"
                  }
                >
                  Equal Split
                </Button>
                <Button variant="outline" size="sm" onClick={handleOneEach}>
                  1 each
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="divide-y divide-border p-0">
                {Array.from(selected).map((id) => {
                  const s = getSubscriberById(id);
                  if (!s) return null;
                  return (
                    <div key={id} className="flex items-center gap-4 px-4 py-3">
                      <div className="flex-1">
                        <p className="font-medium">{s.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {s.address.slice(0, 6)}...{s.address.slice(-4)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="0"
                          value={amounts[id] || ""}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setAmounts({
                              ...amounts,
                              [id]: Number.isFinite(n) && n > 0 ? n : 0,
                            });
                          }}
                          className="w-28 text-right"
                        />
                        <span className="text-xs font-medium text-muted-foreground w-10">
                          {selectedToken.symbol}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
              <span className="text-sm font-medium">Total (notes)</span>
              <span className="text-xl font-bold">
                {totalAmount.toLocaleString()} {selectedToken.symbol}
              </span>
            </div>
            {feePreview.fee > 0 && (
              <p className="text-xs text-muted-foreground">
                Protocol fee ({feePreview.pct}%) is charged on top: you will need{" "}
                <span className="font-medium text-foreground">
                  {formatTokenAmount(feePreview.gross, selectedToken.symbol)}
                </span>{" "}
                in your wallet to deposit.
              </p>
            )}
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
                  {isSpanishUi()
                    ? `Ajustar al máximo (${formatTokenRaw(
                        balanceCheck.maxNetRaw,
                        selectedToken.decimals,
                        selectedToken.symbol,
                      )})`
                    : `Adjust to max (${formatTokenRaw(
                        balanceCheck.maxNetRaw,
                        selectedToken.decimals,
                        selectedToken.symbol,
                      )})`}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Amounts use token decimals (e.g. 1.5 USDT or 5500 COPm). One payout uses a single token for all recipients — for mixed tokens, create separate payouts.
            </p>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("select")} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={() => setStep("review")} disabled={totalAmount === 0} className="gap-2">
                Review
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === "review" && (
          <motion.div
            key="review"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            {txState === "idle" || txState === "error" ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CircleDollarSign className="h-5 w-5 text-muted-foreground" />
                      Payout Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {Array.from(selected).map((id) => {
                        const s = getSubscriberById(id);
                        if (!s) return null;
                        return (
                          <div key={id} className="flex items-center justify-between text-sm">
                            <span>{s.name}</span>
                            <span className="font-medium">
                              {(amounts[id] || 0).toLocaleString()} {selectedToken.symbol}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <Separator />
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Recipients total (notes)</span>
                        <span>{formatTokenAmount(feePreview.net, selectedToken.symbol)}</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Protocol fee ({feePreview.pct}%)</span>
                        <span>{formatTokenAmount(feePreview.fee, selectedToken.symbol)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          {selected.size} recipients
                        </div>
                        <span className="text-2xl font-bold">
                          {formatTokenAmount(feePreview.gross, selectedToken.symbol)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        You pay the gross amount. Recipients claim the note amounts; the fee funds protocol ops and gas sponsorship.
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
                            {isSpanishUi()
                              ? `Ajustar notas a máx. ${formatTokenRaw(
                                  balanceCheck.maxNetRaw,
                                  selectedToken.decimals,
                                  selectedToken.symbol,
                                )}`
                              : `Adjust notes to max ${formatTokenRaw(
                                  balanceCheck.maxNetRaw,
                                  selectedToken.decimals,
                                  selectedToken.symbol,
                                )}`}
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep("amounts")} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    size="lg"
                    onClick={isReady ? handleDeposit : () => openModal()}
                    disabled={Boolean(isReady && balanceCheck && !balanceCheck.ok)}
                    className="gap-2"
                  >
                    <CircleDollarSign className="h-5 w-5" />
                    {isReady
                      ? `Deposit ${formatTokenAmount(feePreview.gross, selectedToken.symbol)}`
                      : "Connect wallet to deposit"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                <TxStatus
                  state={txState}
                  txHash={txHash}
                  explorerUrl={chain.explorerUrl}
                  successMessage="Payout created and funds deposited!"
                  progressMessage={progressMsg}
                />
                {txState === "success" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-center"
                  >
                    <Link href="/payer">
                      <Button variant="outline" className="gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Dashboard
                      </Button>
                    </Link>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
