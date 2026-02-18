"use client";

import { useState } from "react";
import Link from "next/link";
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
  ArrowLeft,
  ArrowRight,
  Users,
  CircleDollarSign,
  Check,
} from "lucide-react";
import {
  CURRENT_PAYER_ID,
  getRegistrationsForPayer,
  getParticipantById,
} from "@/lib/mock-data";
import { createPayout } from "@/lib/mock-actions";

type Step = "select" | "amounts" | "review";

export default function CreatePayoutPage() {
  const regs = getRegistrationsForPayer(CURRENT_PAYER_ID);
  const availableParticipants = regs
    .map((r) => getParticipantById(r.participantId))
    .filter(Boolean) as NonNullable<ReturnType<typeof getParticipantById>>[];

  const [step, setStep] = useState<Step>("select");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<string>();

  const filtered = availableParticipants.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.address.toLowerCase().includes(searchQuery.toLowerCase())
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
      setSelected(new Set(filtered.map((p) => p.id)));
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
    try {
      const result = await createPayout({
        payerId: CURRENT_PAYER_ID,
        participants: Array.from(selected).map((id) => ({
          participantId: id,
          amount: amounts[id] || 0,
        })),
      });
      setTxHash(result.txHash);
      setTxState("success");
      toast.success("Payout created successfully!");
    } catch {
      setTxState("error");
      toast.error("Transaction failed. Please try again.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center gap-3">
        {(["select", "amounts", "review"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : (["select", "amounts", "review"].indexOf(step) >
                        i)
                    ? "bg-primary/20 text-primary"
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
        {/* Step 1: Select Participants */}
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

            <Card className="glass">
              <CardContent className="divide-y divide-border p-0">
                {filtered.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-white/5"
                  >
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggleSelect(p.id)}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{p.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {p.address.slice(0, 6)}...{p.address.slice(-4)}
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

        {/* Step 2: Set Amounts */}
        {step === "amounts" && (
          <motion.div
            key="amounts"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Set amount per subscriber
              </p>
              <Button variant="outline" size="sm" onClick={handleEqualSplit}>
                Equal Split
              </Button>
            </div>

            <Card className="glass">
              <CardContent className="divide-y divide-border p-0">
                {Array.from(selected).map((id) => {
                  const p = getParticipantById(id);
                  if (!p) return null;
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-4 px-4 py-3"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{p.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {p.address.slice(0, 6)}...{p.address.slice(-4)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">$</span>
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
                        <span className="text-xs text-muted-foreground">
                          tokens
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
                ${totalAmount.toLocaleString()} tokens
              </span>
            </div>

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setStep("select")}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => setStep("review")}
                disabled={totalAmount === 0}
                className="gap-2"
              >
                Review
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Review & Deposit */}
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
                <Card className="glass glow-purple">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CircleDollarSign className="h-5 w-5 text-primary" />
                      Payout Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {Array.from(selected).map((id) => {
                        const p = getParticipantById(id);
                        if (!p) return null;
                        return (
                          <div
                            key={id}
                            className="flex items-center justify-between text-sm"
                          >
                            <span>{p.name}</span>
                            <span className="font-medium">
                              ${(amounts[id] || 0).toLocaleString()} tokens
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
                      <span className="text-2xl font-bold gradient-text">
                        ${totalAmount.toLocaleString()} tokens
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setStep("amounts")}
                    className="gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    size="lg"
                    onClick={handleDeposit}
                    className="gap-2"
                  >
                    <CircleDollarSign className="h-5 w-5" />
                    Deposit ${totalAmount.toLocaleString()} tokens
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                <TxStatus
                  state={txState}
                  txHash={txHash}
                  successMessage="Payout created and funds deposited!"
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
