"use client";

import { useState } from "react";
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
} from "@/lib/store";
import { useParaWalletClient } from "@/lib/wallet";
import { useChain } from "@/lib/chain-context";
import type { TokenConfig } from "@/lib/constants";

type Step = "select" | "amounts" | "review";

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
  const { chain } = useChain();
  const [selectedToken, setSelectedToken] = useState<TokenConfig>(chain.defaultToken);
  const { walletClient, isReady } = useParaWalletClient();

  const filtered = availableSubscribers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalAmount = Array.from(selected).reduce(
    (sum, id) => sum + (amounts[id] || 0),
    0
  );

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
    const splitAmount = prompt("Enter total amount to split equally:");
    if (!splitAmount) return;
    const perPerson = Math.floor(Number(splitAmount) / selected.size);
    const next: Record<string, number> = {};
    selected.forEach((id) => {
      next[id] = perPerson;
    });
    setAmounts(next);
  };

  const handleDeposit = async () => {
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
        chainConfig: chain,
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
      toast.error(msg.includes("User rejected") ? "Transaction cancelled" : msg);
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground">Token</label>
                <Select
                  value={selectedToken.symbol}
                  onValueChange={(val) => {
                    const t = chain.tokens.find((t) => t.symbol === val);
                    if (t) setSelectedToken(t);
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {chain.tokens.map((t) => (
                      <SelectItem key={t.symbol} value={t.symbol}>
                        {t.symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={handleEqualSplit}>
                Equal Split
              </Button>
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
                          placeholder="0"
                          value={amounts[id] || ""}
                          onChange={(e) =>
                            setAmounts({
                              ...amounts,
                              [id]: Number(e.target.value),
                            })
                          }
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
              <span className="text-sm font-medium">Total</span>
              <span className="text-xl font-bold">
                {totalAmount.toLocaleString()} {selectedToken.symbol}
              </span>
            </div>

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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        {selected.size} recipients
                      </div>
                      <span className="text-2xl font-bold">
                        {totalAmount.toLocaleString()} {selectedToken.symbol}
                      </span>
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
                    onClick={handleDeposit}
                    disabled={!isReady}
                    className="gap-2"
                  >
                    <CircleDollarSign className="h-5 w-5" />
                    {isReady
                      ? `Deposit ${totalAmount.toLocaleString()} ${selectedToken.symbol}`
                      : "Connect wallet to deposit"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                <TxStatus
                  state={txState}
                  txHash={txHash}
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
