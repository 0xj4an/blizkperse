"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { invalidateAndRefetchStore } from "@/lib/store";
import { toast } from "sonner";
import { useAccount } from "@getpara/react-sdk";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, ClipboardCheck, History, ArrowRight, Loader2 } from "lucide-react";
import {
  useStore,
  getOrganizerById,
  ensureSubscriber,
  joinOrganizer,
  type Payment,
  type Payout,
} from "@/lib/store";
import { useChain } from "@/lib/chain-context";
import { CHAINS, type SupportedChainId } from "@/lib/constants";
import { useParaWalletClient } from "@/lib/wallet";
import { useApiAuth } from "@/lib/api-auth";

function isSpanishUi(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.language.toLowerCase().startsWith("es");
}

function paymentStatusLabel(status: Payment["status"]): string {
  const es = isSpanishUi();
  switch (status) {
    case "pending":
      return es ? "Pendiente de depósito" : "Awaiting deposit";
    case "claimable":
      return es ? "Listo para reclamar" : "Ready to claim";
    case "claimed":
      return es ? "Reclamado" : "Claimed";
    case "expired":
      return es ? "Expirado" : "Expired";
    case "failed":
      return es ? "Fallido" : "Failed";
    default:
      return status;
  }
}

function distributedByToken(payouts: Payout[]): { token: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const p of payouts) {
    if (p.status === "failed" || p.status === "pending") continue;
    const token = p.token?.trim() || "USDC";
    map.set(token, (map.get(token) ?? 0) + p.totalAmount);
  }
  return [...map.entries()]
    .map(([token, amount]) => ({ token, amount }))
    .sort((a, b) => a.token.localeCompare(b.token));
}

function formatTokenAmount(amount: number, symbol: string): string {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${symbol}`;
}

function formatDistributedLabel(payouts: Payout[]): string {
  const totals = distributedByToken(payouts);
  if (totals.length === 0) return "—";
  return totals.map(({ amount, token }) => formatTokenAmount(amount, token)).join(" · ");
}

export default function ReceiveDashboard() {
  const { embedded } = useAccount();
  const address = embedded?.wallets?.[0]?.address ?? "";
  const { walletClient } = useParaWalletClient();
  const apiAuth = useApiAuth();
  const store = useStore();

  // ensure current user exists as subscriber
  const [subId, setSubId] = useState("");
  useEffect(() => {
    if (!address) return;
    ensureSubscriber(address, undefined, undefined, { ...apiAuth, walletClient, address })
      .then((sub) => setSubId(sub.id))
      .catch(() => {});
  }, [address, walletClient, apiAuth]);

  const { chainId: selectedChainId } = useChain();
  const mySubscriptions = store.subscriptions.filter(
    (s) => s.subscriberId === subId
  );
  const myPaymentsAll = store.payments.filter(
    (p) => p.subscriberId === subId
  );
  // Only show payments that were actually deposited (have a note / claimable|claimed).
  // Pending/failed rows from aborted deposit attempts must not appear as claimable.
  const myPayments = myPaymentsAll.filter(
    (p) =>
      (p.status === "claimable" || p.status === "claimed") &&
      p.chainId === selectedChainId
  );
  // Derive which organizers are active on the selected chain (have any payment on it).
  // Orgs with zero payments are shown on all chains (new orgs).
  const orgIdsOnChain = new Set<string>();
  const orgIdsWithPayments = new Set<string>();
  for (const p of store.payments) {
    orgIdsWithPayments.add(p.organizerId);
    if (p.chainId === selectedChainId) orgIdsOnChain.add(p.organizerId);
  }
  const visibleOrganizers = store.organizers.filter(
    (o) => orgIdsOnChain.has(o.id) || !orgIdsWithPayments.has(o.id)
  );
  const visibleOrgIds = new Set(visibleOrganizers.map((o) => o.id));

  const subscribedOrgIds = new Set(mySubscriptions.map((s) => s.organizerId));
  const mySubscriptionsFiltered = mySubscriptions.filter(
    (s) => visibleOrgIds.has(s.organizerId)
  );

  const [joining, setJoining] = useState<string | null>(null);

  // Refetch store when entering receive so payment status (claimable/claimed) matches DB
  useEffect(() => {
    invalidateAndRefetchStore();
  }, []);

  const handleJoin = async (organizerId: string) => {
    if (!subId) return;
    setJoining(organizerId);
    try {
      await joinOrganizer(organizerId, subId, { ...apiAuth, walletClient, address });
      toast.success("Joined successfully!");
    } catch {
      toast.error("Failed to join. Please try again.");
    } finally {
      setJoining(null);
    }
  };

  return (
    <Tabs defaultValue="browse" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3 max-w-md">
        <TabsTrigger value="browse" className="gap-2">
          <Building2 className="h-4 w-4" />
          Organizers
        </TabsTrigger>
        <TabsTrigger value="registrations" className="gap-2">
          <ClipboardCheck className="h-4 w-4" />
          Subscriptions
        </TabsTrigger>
        <TabsTrigger value="history" className="gap-2">
          <History className="h-4 w-4" />
          History
        </TabsTrigger>
      </TabsList>

      {/* Browse Organizers */}
      <TabsContent value="browse" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleOrganizers.map((org) => {
            const isJoined = subscribedOrgIds.has(org.id);
            return (
              <Card key={org.id} className="group transition-colors hover:border-foreground/20">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{org.name}</CardTitle>
                    {isJoined && (
                      <Badge variant="default" className="text-xs">
                        Joined
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground shrink-0">Distributed</span>
                    <span className="font-medium text-right">
                      {formatDistributedLabel(
                        store.payouts.filter((p) => p.organizerId === org.id)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subscribers</span>
                    <span className="font-medium">{org.subscriberCount}</span>
                  </div>
                  {!isJoined && (
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => handleJoin(org.id)}
                      disabled={joining === org.id}
                    >
                      {joining === org.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Join"
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {visibleOrganizers.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              No organizers on {CHAINS[selectedChainId]?.name ?? "this network"}.
            </p>
          )}
        </div>
      </TabsContent>

      {/* Subscriptions */}
      <TabsContent value="registrations">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organizer</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mySubscriptionsFiltered.map((sub) => {
                const org = getOrganizerById(sub.organizerId);
                return (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">
                      {org?.name ?? sub.organizerId}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(sub.joinedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={sub.status === "active" ? "default" : "secondary"}
                      >
                        {sub.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {mySubscriptionsFiltered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No subscriptions on {CHAINS[selectedChainId]?.name ?? "this network"}. Browse organizers to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>

      {/* Payment History - only payments whose note is on the selected chain */}
      <TabsContent value="history">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              History
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Claimable payments on {CHAINS[selectedChainId]?.name ?? "this network"}.
            </p>
          </CardHeader>
          <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organizer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Payout ID</TableHead>
                <TableHead>Note ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myPayments.map((payment) => {
                const org = getOrganizerById(payment.organizerId);
                const payout = store.payouts.find((p) => p.id === payment.payoutId);
                const tokenSymbol = payout?.token?.trim() || "USDC";
                const explorerUrl =
                  CHAINS[payment.chainId as SupportedChainId]?.explorerUrl ??
                  CHAINS[selectedChainId].explorerUrl;
                return (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">
                      {org?.name ?? payment.organizerId}
                    </TableCell>
                    <TableCell>
                      {formatTokenAmount(payment.amount, tokenSymbol)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground" title={payment.payoutId}>
                      {payment.payoutId.slice(0, 8)}...
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground" title={payment.noteId ?? ""}>
                      {payment.noteId ? `${payment.noteId.slice(0, 8)}...` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          payment.status === "claimed"
                            ? "default"
                            : payment.status === "claimable"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {paymentStatusLabel(payment.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-y-1">
                      {payment.status === "claimable" && (
                        <Link href={`/receive/${payment.id}`}>
                          <Button size="sm" variant="outline" className="gap-1">
                            Claim
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      )}
                      {payment.status === "claimed" && (
                        <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                          {payment.claimedAt && (
                            <span>{new Date(payment.claimedAt).toLocaleDateString()}</span>
                          )}
                          {payment.txHash && (
                            <a
                              href={`${explorerUrl}/tx/${payment.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-primary hover:underline"
                              title={payment.txHash}
                            >
                              {payment.txHash.slice(0, 10)}...{payment.txHash.slice(-8)}
                            </a>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {myPayments.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {myPaymentsAll.length === 0
                      ? "No payments yet."
                      : `No payments on ${CHAINS[selectedChainId]?.name ?? "this network"}. Try switching the network above.`}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
