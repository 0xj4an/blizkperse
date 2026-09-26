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
import { ClaimDestinationTip } from "@/components/claim-destination-tip";
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
  invalidateAndRefetchStore,
  refetchStoreIfStale,
} from "@/lib/store";
import { useParaWalletClient } from "@/lib/wallet";
import { useClaimSmartAccount } from "@/lib/alchemy-smart-account";
import {
  formatAlchemyPaymasterError,
  formatInsufficientGasError,
} from "@/lib/alchemy";
import { useChain } from "@/lib/chain-context";
import { CHAINS, type SupportedChainId } from "@/lib/constants";
import {
  generateProof,
  fieldToHex,
  poseidon2,
  computeEntry,
  type ProofInput,
} from "@/lib/zk";
import { buildTreeFromEvents, rootToHex } from "@/lib/merkle";
import { isRootKnown } from "@/lib/contracts";
import { createWalletAuthHeadersGetter, useApiAuth } from "@/lib/api-auth";

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
  const payout = payment
    ? store.payouts.find((p) => p.id === payment.payoutId)
    : undefined;
  const paymentTokenSymbol = payout?.token ?? "USDC";
  const paymentAmountLabel = `${payment?.amount.toLocaleString() ?? "0"} ${paymentTokenSymbol}`;

  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<string>();
  const [justClaimed, setJustClaimed] = useState(false);
  const claimed = justClaimed || payment?.status === "claimed";
  const [claimStep, setClaimStep] = useState<string>("");
  const [claimExplorerUrl, setClaimExplorerUrl] = useState<string>("");
  const [claimRecipient, setClaimRecipient] = useState<string>("");
  const { walletClient, address, isReady } = useParaWalletClient();
  const {
    smartAccount,
    alchemyReady,
    isLoading: alchemyLoading,
    isAlchemyConfigured,
    sponsorshipReady,
  } = useClaimSmartAccount();
  const apiAuth = useApiAuth();
  const getAuthHeaders = createWalletAuthHeadersGetter({
    ...apiAuth,
    walletClient,
    address,
  });
  const { chainId: selectedChainId } = useChain();
  const [destinationAddress, setDestinationAddress] = useState("");
  // When Alchemy is configured, wait for the smart account — do not let EOA claim
  // race ahead while AA is still loading (that path needs native gas, no sponsorship).
  const canSubmitClaim =
    isReady &&
    !alchemyLoading &&
    (alchemyReady || (!isAlchemyConfigured && !!walletClient));

  useEffect(() => {
    if (address && !destinationAddress) setDestinationAddress(address);
  }, [address, destinationAddress]);

  // Soft refetch — avoid full /api/data on every claim-page open if store is fresh.
  useEffect(() => {
    refetchStoreIfStale();
  }, []);

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

  if (payment.status === "failed" || payment.status === "pending" || payment.status === "expired") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12 space-y-3">
            <p className="text-muted-foreground">
              This payment is not claimable ({payment.status}).
            </p>
            <Link href="/receive" className="inline-block">
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
    if (!isReady || alchemyLoading) {
      toast.error(
        alchemyLoading
          ? "Smart account still loading — try again in a moment"
          : "Connect your wallet first",
      );
      return;
    }
    if (isAlchemyConfigured && !alchemyReady) {
      toast.error(
        "Gas sponsorship wallet is not ready. Refresh and try again, or check Alchemy config.",
      );
      return;
    }
    if (!alchemyReady && !walletClient) {
      toast.error("Connect your wallet first");
      return;
    }
    if (!destinationAddress || !/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
      toast.error("Enter a valid destination wallet address");
      return;
    }

    setTxState("pending");
    let claimMode: "standard" | "private" = "standard";
    try {
      // Step 1: Fetch note data for this payment
      setClaimStep("loading-notes");
      let noteData: {
        commitment?: string;
        value?: string;
        holder_pk?: string;
        randomness?: string;
        chain_id?: number;
        token_symbol?: string;
        pool_address?: string;
        denomination_id?: number | null;
      } | null = null;

      // Chain we'll use for this claim (needed before fallback so we pick a note for this chain)
      const noteChainId = (payment.chainId ?? selectedChainId) as SupportedChainId;

      // Prefer notes explicitly linked to this payment
      const authHeaders = await getAuthHeaders();
      const noteRes = await fetch(`/api/notes?payment_id=${paymentId}`, {
        headers: authHeaders,
      });
      if (noteRes.ok) {
        const notes = await noteRes.json();
        noteData = Array.isArray(notes) ? notes[0] : notes;
      }

      // Fallback: latest note for this subscriber on the SAME chain we're claiming on (so commitment is in that chain's tree)
      if (!noteData?.commitment && payment.subscriberId) {
        const fallbackRes = await fetch(
          `/api/notes?subscriber_id=${payment.subscriberId}`,
          {
            headers: authHeaders,
          },
        );
        if (fallbackRes.ok) {
          const fallbackNotes = await fallbackRes.json();
          const list = Array.isArray(fallbackNotes) ? fallbackNotes : [];
          const forChain = list.filter((n: { chain_id?: number }) => (n.chain_id ?? selectedChainId) === noteChainId);
          if (forChain.length > 0) {
            noteData = forChain[forChain.length - 1];
          }
        }
      }

      if (!noteData?.commitment || noteData.value == null || noteData.holder_pk == null || noteData.randomness == null) {
        throw new Error(
          "No note data found for this payment on this network. Link a note to this payment or ensure the deposit was stored for the selected chain.",
        );
      }

      // Use chain we already decided (payment.chainId ?? selectedChainId)
      const noteChain = CHAINS[noteChainId];
      if (!noteChain || noteChain.placeholder) {
        throw new Error(`Contracts not deployed on ${noteChain?.name ?? "unknown chain"} yet.`);
      }

      // The wallet must be on the chain we're using for the tx
      if (selectedChainId !== noteChainId) {
        toast.error(
          `This payment was deposited on ${noteChain.name}. Switch the network to "${noteChain.name}" using the selector above, then try again.`,
        );
        setTxState("idle");
        return;
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

      // Build Merkle tree from indexed Deposit events (server seeds from notes + RPC).
      const treeOpts = {
        tokenSymbol: noteData.token_symbol,
        poolAddress: noteData.pool_address as `0x${string}` | undefined,
      };
      let tree = await buildTreeFromEvents(noteChain, treeOpts);
      let leafIndex = tree.indexOf(commitment);
      // One retry after indexer/sync — Monad historical scans often need a second pass.
      if (leafIndex === -1) {
        try {
          await fetch("/api/sync-pool-root", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(await getAuthHeaders()),
            },
            body: JSON.stringify({
              chain_id: noteChain.id,
              pool_address:
                (noteData.pool_address as string | undefined) ??
                noteChain.pools[noteData.token_symbol ?? noteChain.defaultToken.symbol]?.pool ??
                noteChain.contracts.pool,
              token_symbol: noteData.token_symbol ?? noteChain.defaultToken.symbol,
            }),
          });
        } catch {
          // fall through to rebuild
        }
        await new Promise((r) => setTimeout(r, 1500));
        tree = await buildTreeFromEvents(noteChain, treeOpts);
        leafIndex = tree.indexOf(commitment);
      }
      if (leafIndex === -1) {
        throw new Error(
          "Note commitment not found in Merkle tree. The deposit may not be indexed yet — wait a few seconds and retry.",
        );
      }
      const { siblings, indices, root } = await tree.getProof(leafIndex);

      // Step 3: Generate ZK proof (Standard withdraw or Private withdrawDenom)
      // recipient = where to send funds; can be any address (e.g. connected wallet).
      // pk_b = note owner (from note data); must match for nullifier/commitment.
      setClaimStep("generating-proof");
      const recipientField = fieldToHex(BigInt(destinationAddress));
      const merkleProofLength = String(siblings.length);
      const tokenSymbol = noteData.token_symbol ?? noteChain.defaultToken.symbol;
      const denominationId =
        noteData.denomination_id === null ||
        noteData.denomination_id === undefined
          ? null
          : Number(noteData.denomination_id);
      // Only notes that stored denomination_id (Private depositBatch) use withdrawDenom.
      // Do not infer from amount — Standard can deposit the same raw sizes.
      const isPrivate =
        denominationId !== null &&
        Number.isInteger(denominationId) &&
        denominationId >= 0;

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
        ...(isPrivate
          ? { mode: "private" as const, denomination_id: denominationId! }
          : { mode: "standard" as const }),
      };
      const proofResult = await generateProof(proofInput);
      claimMode = proofResult.mode;

      // Step 4: Wait for backend root registrar (permissioned). Trigger sync if needed.
      setClaimStep("registering-root");
      const rootHex = rootToHex(root);
      const poolAddress =
        (noteData.pool_address as `0x${string}` | undefined) ??
        noteChain.pools[tokenSymbol]?.pool ??
        noteChain.contracts.pool;

      let known = await isRootKnown(noteChain, rootHex, tokenSymbol);
      let syncHint = "";
      if (!known) {
        try {
          const syncRes = await fetch("/api/sync-pool-root", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(await getAuthHeaders()),
            },
            body: JSON.stringify({
              chain_id: noteChain.id,
              pool_address: poolAddress,
              token_symbol: tokenSymbol,
            }),
          });
          const syncBody = (await syncRes.json().catch(() => null)) as {
            ok?: boolean;
            skipped?: string;
            error?: string;
            alreadyKnown?: boolean;
            txHash?: string;
          } | null;
          if (!syncRes.ok) {
            syncHint = syncBody?.error ?? `sync failed (${syncRes.status})`;
          } else if (syncBody?.skipped) {
            syncHint = syncBody.skipped;
          }
        } catch {
          // continue polling — sync may already be in flight from deposit
        }
        for (let i = 0; i < 30 && !known; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          known = await isRootKnown(noteChain, rootHex, tokenSymbol);
        }
      }
      if (!known) {
        const detail = syncHint ? ` (${syncHint})` : "";
        throw new Error(
          `Merkle root is not registered yet. The backend registrar may still be syncing — retry in a moment.${detail}`,
        );
      }

      // Step 5: Submit withdrawal (Alchemy AA when ready, else Para EOA)
      setClaimStep("withdrawing");
      // Prefer AA whenever the smart account is ready. Sponsorship needs policy ID
      // baked at build time (`NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID`); without it AA
      // still runs but the UserOp is not gas-sponsored.
      if (isAlchemyConfigured && !sponsorshipReady) {
        console.warn(
          "[claim] Alchemy AA without gas policy — UserOp will not be sponsored",
          { alchemyReady, sponsorshipReady },
        );
      }
      const result = await claimPayment(
        paymentId,
        walletClient ?? undefined,
        proofResult,
        noteChain,
        { ...apiAuth, walletClient, address },
        tokenSymbol,
        alchemyReady ? smartAccount : null,
      );
      setTxHash(result.txHash);
      setClaimExplorerUrl(noteChain.explorerUrl);
      setClaimRecipient(destinationAddress);
      setTxState("success");
      setJustClaimed(true);
      toast.success("Payment claimed successfully!");
    } catch (err) {
      console.error("Claim failed:", err);
      const raw = err instanceof Error ? err.message : String(err);
      const lower = raw.toLowerCase();
      const alreadyClaimedOnChain =
        (lower.includes("nullifier") &&
          (lower.includes("used") ||
            lower.includes("already") ||
            lower.includes("spent") ||
            lower.includes("seen"))) ||
        lower.includes("already claimed") ||
        lower.includes("already withdrawn");
      if (alreadyClaimedOnChain) {
        setTxState("idle");
        try {
          await fetch(`/api/payments/${paymentId}/claim`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(await getAuthHeaders()),
            },
            body: JSON.stringify({}),
          });
          await invalidateAndRefetchStore();
        } catch {
          // ignore
        }
        setJustClaimed(true);
        toast.success(
          "Payment claimed successfully. On-chain withdrawal was confirmed.",
        );
        return;
      }
      setTxState("error");
      const paymasterMsg = formatAlchemyPaymasterError(err);
      const gasMsg = formatInsufficientGasError(err, "claim");
      const msg = paymasterMsg
        ? paymasterMsg
        : gasMsg
          ? gasMsg
          : raw.includes("User rejected")
            ? "Transaction cancelled"
            : raw.includes("SumcheckFailed") || raw.includes("0x9fc3a218")
              ? `Proof verification failed (SumcheckFailed). The deployed ${
                  claimMode === "private"
                    ? "WithdrawDenomVerifier"
                    : "WithdrawVerifier"
                } may not match the circuit used by this app. Recompile and redeploy the verifier from the same zk/circuits build used by /api/generate-proof.`
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
        <Card className={claimed ? "overflow-hidden" : "overflow-visible"}>
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
                {payment.amount.toLocaleString()} {paymentTokenSymbol}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">note amount</p>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">From</span>
                <span className="font-medium">{org?.name ?? "Unknown"}</span>
              </div>
              <div className="flex items-center justify-between text-sm gap-2">
                <span className="text-muted-foreground shrink-0">Payment ID</span>
                <span className="font-mono text-xs truncate" title={payment.id}>{payment.id.slice(0, 8)}...{payment.id.slice(-6)}</span>
              </div>
              <div className="flex items-center justify-between text-sm gap-2">
                <span className="text-muted-foreground shrink-0">Payout ID</span>
                <span className="font-mono text-xs truncate" title={payment.payoutId}>{payment.payoutId.slice(0, 8)}...{payment.payoutId.slice(-6)}</span>
              </div>
              {payment.noteId && (
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-muted-foreground shrink-0">Note ID</span>
                  <span className="font-mono text-xs truncate" title={payment.noteId}>{payment.noteId.slice(0, 8)}...{payment.noteId.slice(-6)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={claimed ? "default" : "secondary"}>
                  {claimed ? "Claimed" : "Claimable"}
                </Badge>
              </div>
              {claimed && (txHash || payment.txHash) && (
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-muted-foreground shrink-0">Tx Hash</span>
                  <a
                    href={`${claimExplorerUrl || CHAINS[selectedChainId].explorerUrl}/tx/${txHash || payment.txHash || ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:underline truncate"
                    title={txHash || payment.txHash || ""}
                  >
                    {(txHash || payment.txHash || "").slice(0, 10)}...{(txHash || payment.txHash || "").slice(-8)}
                  </a>
                </div>
              )}
            </div>

            {!claimed && txState === "idle" && (
              <div className="space-y-3">
                <ClaimDestinationTip enabled>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      Destination wallet (receives {paymentAmountLabel})
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
                        Use connected wallet ({address.slice(0, 6)}...
                        {address.slice(-4)})
                      </button>
                    )}
                  </div>
                </ClaimDestinationTip>
                <Button
                  size="lg"
                  className="w-full gap-2"
                  onClick={handleClaim}
                  disabled={!canSubmitClaim}
                >
                  <Wallet className="h-5 w-5" />
                  {alchemyLoading
                    ? "Preparing sponsored wallet…"
                    : canSubmitClaim
                      ? "Claim Payment"
                      : isAlchemyConfigured && isReady && !alchemyReady
                        ? "Sponsored wallet unavailable"
                        : "Connect wallet to claim"}
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
