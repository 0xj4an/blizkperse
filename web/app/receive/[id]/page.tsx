"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TxStatus, type TxState } from "@/components/tx-status";
import {
  ArrowLeft,
  CircleDollarSign,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import {
  useStore,
  getOrganizerById,
  claimPayment,
} from "@/lib/store";
import { useParaWalletClient } from "@/lib/wallet";
import { generateProof, fieldToHex, type ProofInput } from "@/lib/zk";
import { buildTreeFromEvents, rootToHex } from "@/lib/merkle";
import { registerRoot } from "@/lib/contracts";

const STEP_MESSAGES: Record<string, string> = {
  "loading-notes": "Loading payment data...",
  "building-tree": "Building merkle tree from on-chain data...",
  "generating-proof": "Generating ZK proof (this may take 10-30 seconds)...",
  "registering-root": "Registering merkle root on-chain...",
  "withdrawing": "Submitting withdrawal transaction...",
};

export default function ClaimPage() {
  const params = useParams();
  const paymentId = params.id as string;
  const store = useStore();

  const payment = store.payments.find((p) => p.id === paymentId);
  const org = payment ? getOrganizerById(payment.organizerId) : undefined;

  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<string>();
  const [claimed, setClaimed] = useState(payment?.status === "claimed");
  const [claimStep, setClaimStep] = useState<string>("");
  const { walletClient, isReady } = useParaWalletClient();

  if (!payment) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Card className="glass max-w-md w-full text-center">
          <CardContent className="py-12">
            <p className="text-muted-foreground">Payment not found.</p>
            <Link href="/receive" className="mt-4 inline-block">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleClaim = async () => {
    if (!walletClient) {
      // Fallback: mock claim without wallet
      setTxState("pending");
      try {
        const result = await claimPayment(paymentId);
        setTxHash(result.txHash);
        setTxState("success");
        setClaimed(true);
        toast.success("Payment claimed successfully!");
      } catch {
        setTxState("error");
        toast.error("Claim failed. Please try again.");
      }
      return;
    }

    setTxState("pending");
    try {
      // Step 1: Fetch note data
      setClaimStep("loading-notes");
      const noteRes = await fetch(`/api/notes?payment_id=${paymentId}`);
      const noteData = noteRes.ok ? await noteRes.json() : null;

      if (!noteData) {
        // No note data — fallback to mock claim
        const result = await claimPayment(paymentId);
        setTxHash(result.txHash);
        setTxState("success");
        setClaimed(true);
        toast.success("Payment claimed successfully!");
        return;
      }

      // Step 2: Build merkle tree from Deposit events
      setClaimStep("building-tree");
      const tree = await buildTreeFromEvents();
      const leafIndex = tree.indexOf(BigInt(noteData.commitment));
      if (leafIndex === -1) throw new Error("Note not found in merkle tree");

      const { siblings, indices, root } = await tree.getProof(leafIndex);

      // Step 3: Generate ZK proof
      setClaimStep("generating-proof");
      const proofInput: ProofInput = {
        new_commitment: "0x" + "0".repeat(64), // burn commitment = 0 for withdraw
        nullifier_in: noteData.nullifier,
        merkle_proof_length: String(indices.length),
        expected_merkle_root: fieldToHex(root),
        value: noteData.value,
        pk_b: noteData.holder_pk,
        random: noteData.randomness,
        from: noteData.holder_pk,
        merkle_proof_indices: indices,
        merkle_proof_siblings: siblings.map((s: bigint) => fieldToHex(s)),
      };
      const proofResult = await generateProof(proofInput);

      // Step 4: Register root on-chain (may already exist)
      setClaimStep("registering-root");
      try {
        await registerRoot(walletClient, rootToHex(root));
      } catch {
        // Root may already be registered — OK
      }

      // Step 5: Submit withdrawal
      setClaimStep("withdrawing");
      const result = await claimPayment(paymentId, walletClient, proofResult);
      setTxHash(result.txHash);
      setTxState("success");
      setClaimed(true);
      toast.success("Payment claimed successfully!");
    } catch (err) {
      console.error("Claim failed:", err);
      setTxState("error");
      const msg = err instanceof Error ? err.message : "Claim failed";
      toast.error(msg.includes("User rejected") ? "Transaction cancelled" : msg);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href="/receive">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="glass glow-purple overflow-hidden">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              {claimed ? (
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              ) : (
                <CircleDollarSign className="h-8 w-8 text-primary" />
              )}
            </div>
            <CardTitle className="text-xl">
              {claimed ? "Payment Received" : "Payment Available"}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="text-center">
              <p className="text-4xl font-bold gradient-text">
                ${payment.amount.toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">tokens</p>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">From</span>
                <span className="font-medium">{org?.name ?? "Unknown"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={claimed ? "default" : "secondary"}>
                  {claimed ? "Claimed" : "Claimable"}
                </Badge>
              </div>
              {claimed && (payment.claimedAt || txHash) && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tx Hash</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {(txHash || payment.txHash || "").slice(0, 10)}...
                    {(txHash || payment.txHash || "").slice(-8)}
                  </span>
                </div>
              )}
            </div>

            {!claimed && txState === "idle" && (
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={handleClaim}
                disabled={!isReady}
              >
                <Wallet className="h-5 w-5" />
                {isReady ? "Transfer to Wallet" : "Connect wallet to claim"}
              </Button>
            )}

            {(txState === "pending" || txState === "success" || txState === "error") && (
              <TxStatus
                state={txState}
                txHash={txHash}
                successMessage="Payment transferred to your wallet!"
                progressMessage={STEP_MESSAGES[claimStep] || "Processing..."}
              />
            )}

            {txState === "error" && (
              <Button variant="outline" className="w-full" onClick={handleClaim}>
                Try Again
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
