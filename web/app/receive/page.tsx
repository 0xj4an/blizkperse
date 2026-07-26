"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { invalidateAndRefetchStore } from "@/lib/store";
import { toast } from "sonner";
import { useAccount } from "@getpara/react-sdk";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  fetchInvite,
  joinWithInvite,
  type Payment,
  type Payout,
} from "@/lib/store";
import { useChain } from "@/lib/chain-context";
import { CHAINS, type SupportedChainId } from "@/lib/constants";
import { useParaWalletClient } from "@/lib/wallet";
import { useApiAuth } from "@/lib/api-auth";

/** Decode a captured invite value; strip accidental wrapping quotes. */
function decodeInviteValue(value: string): string {
  const unquoted = value.replace(/^["']+|["']+$/g, "").trim();
  try {
    return decodeURIComponent(unquoted).trim();
  } catch {
    return unquoted;
  }
}

/**
 * Extract invite code from paste: bare code, absolute/relative URL with
 * `?invite=`, extra query params, whitespace, or light trailing chat junk.
 */
function parseInviteInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Prefer an explicit `invite=` capture (stops at &, #, whitespace, quotes).
  const fromParam = trimmed.match(/[?&]invite=([^&#\s"'<>]+)/i);
  if (fromParam?.[1]) return decodeInviteValue(fromParam[1]);

  // Absolute URL embedded in chat text (optional trailing punctuation).
  const urlInText = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (urlInText?.[0]) {
    try {
      const cleanedUrl = urlInText[0].replace(/[.,;:!?)]+$/, "");
      const fromQuery = new URL(cleanedUrl).searchParams.get("invite");
      if (fromQuery?.trim()) return decodeInviteValue(fromQuery);
    } catch {
      // Fall through.
    }
  }

  // Absolute URL as the whole paste (may include other query params).
  try {
    const fromQuery = new URL(trimmed).searchParams.get("invite");
    if (fromQuery?.trim()) return decodeInviteValue(fromQuery);
  } catch {
    // Not an absolute URL — bare code path below.
  }

  // Bare code: first token, drop common trailing punctuation from chat.
  const firstToken = (trimmed.split(/\s+/)[0] ?? trimmed).replace(
    /[.,;:!?)\]}>]+$/g,
    "",
  );
  return firstToken;
}

function paymentStatusLabel(status: Payment["status"]): string {
  switch (status) {
    case "pending":
      return "Awaiting deposit";
    case "claimable":
      return "Ready to claim";
    case "claimed":
      return "Claimed";
    case "expired":
      return "Expired";
    case "failed":
      return "Failed";
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

function ReceiveDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryInvite = (searchParams.get("invite") ?? "").trim();

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

  const [inviteInput, setInviteInput] = useState(queryInvite);
  const [activeInviteCode, setActiveInviteCode] = useState(queryInvite);
  const [joining, setJoining] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(Boolean(queryInvite));
  const [inviteInfo, setInviteInfo] = useState<{
    code: string;
    organizerId: string;
    organizerName: string;
    maxUses: number;
    useCount: number;
    remaining: number;
    used: boolean;
    expired: boolean;
    valid: boolean;
  } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Deep link: sync query param into active code (do not clear on replace after join).
  useEffect(() => {
    if (!queryInvite) return;
    setActiveInviteCode(queryInvite);
    setInviteInput(queryInvite);
  }, [queryInvite]);

  // Refetch store when entering receive so payment status (claimable/claimed) matches DB
  useEffect(() => {
    invalidateAndRefetchStore();
  }, []);

  useEffect(() => {
    if (!activeInviteCode) {
      setInviteInfo(null);
      setInviteError(null);
      setInviteLoading(false);
      return;
    }

    let cancelled = false;
    setInviteLoading(true);
    setInviteError(null);
    fetchInvite(activeInviteCode)
      .then((info) => {
        if (cancelled) return;
        if (!info) {
          setInviteInfo(null);
          setInviteError("Invite not found or invalid.");
          return;
        }
        setInviteInfo(info);
        if (!info.valid) {
          setInviteError(
            info.used
              ? "This invite link is fully used."
              : "This invite link has expired.",
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInviteInfo(null);
          setInviteError("Failed to load invite.");
        }
      })
      .finally(() => {
        if (!cancelled) setInviteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeInviteCode]);

  const handleRedeemInvite = () => {
    const code = parseInviteInput(inviteInput);
    if (!code) {
      setInviteError("Paste the invite link or just the code.");
      setInviteInfo(null);
      setActiveInviteCode("");
      return;
    }
    setInviteError(null);
    setActiveInviteCode(code);
  };

  const handleJoinWithInvite = async () => {
    if (!subId || !inviteInfo?.valid) return;
    setJoining(true);
    try {
      await joinWithInvite(inviteInfo.code, subId, {
        ...apiAuth,
        walletClient,
        address,
      });
      toast.success("Joined successfully!");
      const remaining = Math.max(0, inviteInfo.remaining - 1);
      const exhausted = remaining <= 0;
      setInviteInfo({
        ...inviteInfo,
        useCount: inviteInfo.useCount + 1,
        remaining,
        used: exhausted,
        // Stay valid for remaining slots; this user sees "Already joined" via inviteOrgJoined.
        valid: !exhausted,
      });
      setInviteError(null);
      if (queryInvite) {
        router.replace("/receive");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to join. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const inviteOrgJoined =
    inviteInfo != null && subscribedOrgIds.has(inviteInfo.organizerId);

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
        <Card className="border-foreground/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Redeem invite</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleRedeemInvite();
                  }
                }}
                placeholder="Paste the invite link or just the code — we'll handle either"
                className="font-mono text-sm"
                aria-label="Paste the invite link or just the code"
              />
              <Button
                size="default"
                variant="secondary"
                className="shrink-0"
                onClick={handleRedeemInvite}
                disabled={inviteLoading}
              >
                Redeem invite
              </Button>
            </div>

            {activeInviteCode ? (
              inviteLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading invite…
                </div>
              ) : inviteInfo ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Organization</span>
                    <span className="font-medium">{inviteInfo.organizerName}</span>
                  </div>
                  {inviteInfo.maxUses > 1 && inviteInfo.valid && (
                    <p className="text-xs text-muted-foreground">
                      {inviteInfo.remaining} of {inviteInfo.maxUses} spots left
                    </p>
                  )}
                  {inviteOrgJoined ? (
                    <Badge variant="default" className="text-xs">
                      Already joined
                    </Badge>
                  ) : inviteInfo.valid ? (
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={handleJoinWithInvite}
                      disabled={joining || !subId}
                    >
                      {joining ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Join organization"
                      )}
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {inviteError ?? "This invite is no longer valid."}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {inviteError ?? "You need a valid invite link or code to join."}
                </p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                {inviteError ??
                  "Paste the invite link or just the code from the organizer — we'll handle either."}
              </p>
            )}
          </CardContent>
        </Card>

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
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      Invite required to join
                    </p>
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
                    No subscriptions on {CHAINS[selectedChainId]?.name ?? "this network"}. Redeem an
                    invite to join an organization.
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

export default function ReceiveDashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      }
    >
      <ReceiveDashboardInner />
    </Suspense>
  );
}
