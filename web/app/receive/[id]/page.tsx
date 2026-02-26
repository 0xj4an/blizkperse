"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { CHAINS, type SupportedChainId } from "@/lib/constants";
import {
  generateProof,
  fieldToHex,
  poseidon2,
  computeEntry,
  type ProofInput,
} from "@/lib/zk";
import { buildTreeFromEvents, rootToHex } from "@/lib/merkle";
import { registerRoot } from "@/lib/contracts";

const STEP_MESSAGES: Record<string, string> = {
  "loading-notes": "Loading payment data...",
  "building-tree": "Recomputing note commitment...",
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
  const [claimExplorerUrl, setClaimExplorerUrl] = useState<string>("");
  const [claimRecipient, setClaimRecipient] = useState<string>("");
  const { walletClient, address, isReady } = useParaWalletClient();
  const [destinationAddress, setDestinationAddress] = useState("");

  useEffect(() => {
    if (address && !destinationAddress) setDestinationAddress(address);
  }, [address, destinationAddress]);

  if (!payment) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Card className="max-w-md w-full text-center">
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
    if (!walletClient || !isReady) {
      toast.error("Connect your wallet first");
      return;
    }
    if (!destinationAddress || !/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
      toast.error("Enter a valid destination wallet address");
      return;
    }

    setTxState("pending");
    try {
      // Step 1: Fetch note data for this payment
      setClaimStep("loading-notes");
      let noteData: { commitment?: string; value?: string; holder_pk?: string; randomness?: string; chain_id?: number } | null = null;

      // Prefer notes explicitly linked to this payment
      const noteRes = await fetch(`/api/notes?payment_id=${paymentId}`);
      if (noteRes.ok) {
        const notes = await noteRes.json();
        noteData = Array.isArray(notes) ? notes[0] : notes;
      }

      // Fallback: find latest note for this subscriber (handles older deposits without payment_id)
      if (!noteData?.commitment && payment.subscriberId) {
        const fallbackRes = await fetch(
          `/api/notes?subscriber_id=${payment.subscriberId}`,
        );
        if (fallbackRes.ok) {
          const fallbackNotes = await fallbackRes.json();
          if (Array.isArray(fallbackNotes) && fallbackNotes.length > 0) {
            noteData = fallbackNotes[fallbackNotes.length - 1];
          }
        }
      }

      if (!noteData?.commitment || noteData.value == null || noteData.holder_pk == null || noteData.randomness == null) {
        throw new Error(
          "No note data found for this payment. The deposit may not have stored note details.",
        );
      }

      // Use the note's chain (where the deposit was made), not the currently selected chain
      const noteChainId = (noteData.chain_id ?? 143) as SupportedChainId;
      const noteChain = CHAINS[noteChainId];
      if (!noteChain || noteChain.placeholder) {
        throw new Error(`Contracts not deployed on ${noteChain?.name ?? "unknown chain"} yet.`);
      }

      // Step 2: Recompute note values from raw inputs using circuit-matching Poseidon
      // This handles both old deposits (Poseidon2 on-chain) and new ones (correct Poseidon)
      setClaimStep("building-tree");
      const valueBig = BigInt(noteData.value);
      const holderPk = BigInt(noteData.holder_pk);
      const randomBig = BigInt(noteData.randomness);

      // Recompute nullifier and commitment with the circuit's Poseidon hash
      const nullifier = await poseidon2(randomBig, holderPk);
      const commitment = await computeEntry(
        valueBig,
        holderPk,
        randomBig,
        nullifier,
      );

      // Build Merkle tree from on-chain deposits and find this note's path
      const tree = await buildTreeFromEvents(noteChain);
      const leafIndex = tree.indexOf(commitment);
      if (leafIndex === -1) {
        throw new Error(
          "Note commitment not found in Merkle tree. The deposit may not be indexed yet.",
        );
      }
      const { siblings, indices, root } = await tree.getProof(leafIndex);

      console.log("Merkle root usado en el proof:", fieldToHex(root));

      // Step 3: Generate ZK proof (withdraw circuit)
      // recipient = where to send the 1 USDC; can be any address (e.g. connected wallet).
      // pk_b = note owner (from note data); must match for nullifier/commitment.
      setClaimStep("generating-proof");
      const recipientField = fieldToHex(BigInt(destinationAddress));
      const merkleProofLength = String(siblings.length);
      const proofInput: ProofInput = {
        value: fieldToHex(valueBig),
        nullifier: fieldToHex(nullifier),
        merkle_proof_length: merkleProofLength,
        expected_merkle_root: fieldToHex(root),
        recipient: recipientField,
        pk_b: fieldToHex(holderPk),
        random: fieldToHex(randomBig),
        merkle_proof_indices: indices,
        merkle_proof_siblings: siblings.map((sibling) => fieldToHex(sibling)),
      };
      console.log("Proof input:", JSON.stringify(proofInput, null, 2));
      const proofResult = await generateProof(proofInput);

      // Step 4: Register root on-chain (may already exist)
      setClaimStep("registering-root");
      try {
        await registerRoot(walletClient, noteChain, rootToHex(root));
      } catch {
        // Root may already be registered - OK
      }

      // Step 5: Submit withdrawal
      setClaimStep("withdrawing");
      const result = await claimPayment(paymentId, walletClient, proofResult, noteChain);
      setTxHash(result.txHash);
      setClaimExplorerUrl(noteChain.explorerUrl);
      setClaimRecipient(destinationAddress);
      setTxState("success");
      setClaimed(true);
      toast.success("Payment claimed successfully!");
    } catch (err) {
      console.error("Claim failed:", err);
      setTxState("error");
      const raw = err instanceof Error ? err.message : "Claim failed";
      const msg = raw.includes("User rejected")
        ? "Transaction cancelled"
        : raw.includes("SumcheckFailed") || raw.includes("0x9fc3a218")
          ? "Proof verification failed (SumcheckFailed). The deployed WithdrawVerifier may not match the circuit used by this app—recompile and redeploy the verifier from the same zk/circuits build used by /api/generate-proof."
          : raw;
      toast.error(msg);
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
        <Card className="overflow-hidden">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-foreground/10">
              {claimed ? (
                <CheckCircle2 className="h-8 w-8 text-green-500/80" />
              ) : (
                <CircleDollarSign className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <CardTitle className="text-xl">
              {claimed ? "Payment Received" : "Payment Available"}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="text-center">
              <p className="text-4xl font-bold">
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
                  <a
                    href={`${claimExplorerUrl || CHAINS[143].explorerUrl}/tx/${txHash || payment.txHash || ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {(txHash || payment.txHash || "").slice(0, 10)}...
                    {(txHash || payment.txHash || "").slice(-8)}
                  </a>
                </div>
              )}
            </div>

            {!claimed && txState === "idle" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">
                    Destination wallet (receives the 1 USDC)
                  </label>
                  <Input
                    placeholder="0x..."
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    className="font-mono text-sm"
                  />
                  {address && destinationAddress !== address && (
                    <button
                      type="button"
                      onClick={() => setDestinationAddress(address)}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Use connected wallet ({address.slice(0, 6)}...{address.slice(-4)})
                    </button>
                  )}
                </div>
                <Button
                  size="lg"
                  className="w-full gap-2"
                  onClick={handleClaim}
                  disabled={!isReady}
                >
                  <Wallet className="h-5 w-5" />
                  {isReady ? "Claim Payment" : "Connect wallet to claim"}
                </Button>
              </div>
            )}

            {(txState === "pending" || txState === "success" || txState === "error") && (
              <TxStatus
                state={txState}
                successMessage="Payment transferred to your wallet!"
                successDetail={claimRecipient ? `Received by: ${claimRecipient.slice(0, 6)}...${claimRecipient.slice(-4)}` : undefined}
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
