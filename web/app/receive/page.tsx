"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAccount } from "@getpara/react-sdk";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  useStore,
  getOrganizerById,
  ensureSubscriber,
  fetchInvite,
  joinWithInvite,
  refetchStoreIfStale,
  invalidateAndRefetchStore,
  reconcileClaimedPayments,
  hasClaimablePayments,
  type Payment,
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

function formatTokenAmount(amount: number, symbol: string): string {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${symbol}`;
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

  // Prefer subscriber already in the hydrated store — avoid waiting on ensureSubscriber for join UI.
  const storeSubId =
    address
      ? store.subscribers.find(
          (s) => s.address.toLowerCase() === address.toLowerCase(),
        )?.id ?? ""
      : "";
  const [ensuredSubId, setEnsuredSubId] = useState("");
  const subId = storeSubId || ensuredSubId;

  useEffect(() => {
    if (!address || storeSubId) return;
    ensureSubscriber(address, undefined, undefined, { ...apiAuth, walletClient, address })
      .then((sub) => setEnsuredSubId(sub.id))
      .catch(() => {});
  }, [address, storeSubId, walletClient, apiAuth]);

  const { chainId: selectedChainId, setChainId } = useChain();
  const mySubscriptions = store.subscriptions.filter(
    (s) => s.subscriberId === subId
  );
  const myPaymentsAll = store.payments.filter(
    (p) => p.subscriberId === subId
  );
  const isRealPayment = (p: Payment) => {
    if (p.status === "claimed") return Boolean(p.noteId);
    if (p.status === "claimable") return Boolean(p.noteId) && p.depositConfirmed === true;
    return false;
  };
  const mine = myPaymentsAll.filter(isRealPayment);
  const onThisChain = mine.filter((p) => p.chainId === selectedChainId);
  const onOtherChains = mine.filter((p) => p.chainId != null && p.chainId !== selectedChainId);
  const claimableHere = onThisChain.filter((p) => p.status === "claimable");
  const claimedHere = onThisChain.filter((p) => p.status === "claimed");
  const claimableElsewhere = onOtherChains.filter((p) => p.status === "claimable");
  const claimedElsewhere = onOtherChains.filter((p) => p.status === "claimed");

  const subscribedOrgIds = new Set(mySubscriptions.map((s) => s.organizerId));

  const [inviteInput, setInviteInput] = useState(queryInvite);
  const [activeInviteCode, setActiveInviteCode] = useState(queryInvite);
  const [joining, setJoining] = useState(false);
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

  // Soft store refresh on mount; reconcile claimables in the background (never block first paint).
  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const runReconcile = async () => {
      if (cancelled || !address || !walletClient) return;

      await refetchStoreIfStale();
      if (cancelled) return;

      if (!hasClaimablePayments(subId || undefined)) return;

      const n = await reconcileClaimedPayments({
        ...apiAuth,
        walletClient,
        address,
      });
      if (cancelled || n <= 0) return;
      invalidateAndRefetchStore();
    };

    // Paint first with existing store data; soft-refresh + reconcile after idle.
    refetchStoreIfStale();

    const schedule =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? () => {
            idleId = window.requestIdleCallback(
              () => {
                void runReconcile();
              },
              { timeout: 2500 },
            );
          }
        : () => {
            timeoutId = setTimeout(() => {
              void runReconcile();
            }, 400);
          };
    schedule();

    return () => {
      cancelled = true;
      if (
        idleId != null &&
        typeof window !== "undefined" &&
        "cancelIdleCallback" in window
      ) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [address, walletClient, apiAuth, subId]);

  useEffect(() => {
    if (!activeInviteCode) {
      setInviteInfo(null);
      setInviteError(null);
      return;
    }

    let cancelled = false;
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
      });

    return () => {
      cancelled = true;
    };
  }, [activeInviteCode]);

  const handleJoinWithInvite = async () => {
    if (!subId || !inviteInfo?.valid) return;
    setJoining(true);
    try {
      await joinWithInvite(
        inviteInfo.code,
        subId,
        {
          ...apiAuth,
          walletClient,
          address,
        },
        {
          id: inviteInfo.organizerId,
          name: inviteInfo.organizerName,
        },
      );
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

  const alreadyJoined =
    inviteInfo != null && subscribedOrgIds.has(inviteInfo.organizerId);
  const autoJoinFor = useRef<string | null>(null);

  useEffect(() => {
    if (!queryInvite || !subId || !inviteInfo?.valid || joining || alreadyJoined) return;
    if (autoJoinFor.current === inviteInfo.code) return;
    autoJoinFor.current = inviteInfo.code;
    void handleJoinWithInvite();
    // Joins once per code. The handler is recreated each render and must not retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInvite, subId, inviteInfo, joining, alreadyJoined]);

  const tokenFor = (payment: Payment) =>
    store.payouts.find((p) => p.id === payment.payoutId)?.token?.trim() || "USDC";

  const chainName = (chainId: number | undefined) =>
    chainId != null ? CHAINS[chainId as SupportedChainId]?.name : undefined;

  const handleJoinFromPaste = async () => {
    const code = parseInviteInput(inviteInput);
    if (!code) {
      setInviteError("Paste the invite link or just the code.");
      setInviteInfo(null);
      return;
    }
    if (!subId) {
      setInviteError("Sign in to join.");
      return;
    }
    setJoining(true);
    setInviteError(null);
    try {
      const info = await fetchInvite(code);
      if (!info) {
        setInviteInfo(null);
        setInviteError("Invite not found.");
        return;
      }
      setInviteInfo(info);
      setActiveInviteCode(code);
      if (!info.valid) {
        setInviteError(info.used ? "This invite link is fully used." : "This invite link has expired.");
        return;
      }
      if (subscribedOrgIds.has(info.organizerId)) {
        toast.message(`You already joined ${info.organizerName}.`);
        return;
      }
      await joinWithInvite(
        info.code,
        subId,
        { ...apiAuth, walletClient, address },
        { id: info.organizerId, name: info.organizerName },
      );
      toast.success(`Joined ${info.organizerName}.`);
      setInviteInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="space-y-8">
      {joining && inviteInfo ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Joining {inviteInfo.organizerName}...
        </p>
      ) : null}

      {claimableHere.length > 0 && (
        <section className="space-y-3">
          {claimableHere.map((payment) => {
            const org = getOrganizerById(payment.organizerId);
            return (
              <Card key={payment.id} className="border-primary/30">
                <CardContent className="space-y-4 p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">{org?.name ?? "Payment"}</p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight">
                      {formatTokenAmount(payment.amount, tokenFor(payment))}
                    </p>
                  </div>
                  <Link href={`/receive/${payment.id}`} className="block">
                    <Button className="w-full" size="lg">Get paid</Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {claimableElsewhere.length > 0 && (
        <section className="space-y-3">
          {claimableElsewhere.map((payment) => {
            const org = getOrganizerById(payment.organizerId);
            const name = chainName(payment.chainId);
            return (
              <Card key={payment.id}>
                <CardContent className="space-y-4 p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">{org?.name ?? "Payment"}</p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight">
                      {formatTokenAmount(payment.amount, tokenFor(payment))}
                    </p>
                    {name ? (
                      <p className="mt-1 text-sm text-muted-foreground">This is on {name}.</p>
                    ) : null}
                  </div>
                  {payment.chainId != null && (
                    <Button
                      className="w-full"
                      variant="secondary"
                      onClick={() => setChainId(payment.chainId as SupportedChainId)}
                    >
                      Switch to {name}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {claimableHere.length === 0 && claimableElsewhere.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing waiting on {CHAINS[selectedChainId]?.name ?? "this network"}.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Your groups</h2>
        {mySubscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have not joined a group yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {mySubscriptions.map((sub) => {
              const org = getOrganizerById(sub.organizerId);
              return (
                <li key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="font-medium">{org?.name ?? "Group"}</span>
                  <Badge variant={sub.status === "active" ? "default" : "secondary"}>
                    {sub.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Join with a link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleJoinFromPaste();
                }
              }}
              placeholder="Paste the link or the code"
              className="text-sm"
              aria-label="Invite link or code"
            />
            <Button
              className="shrink-0"
              onClick={() => void handleJoinFromPaste()}
              disabled={joining || !inviteInput.trim()}
            >
              {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join"}
            </Button>
          </div>
          {alreadyJoined ? (
            <p className="text-sm text-muted-foreground">You already joined {inviteInfo?.organizerName}.</p>
          ) : null}
          {inviteError ? <p className="text-sm text-muted-foreground">{inviteError}</p> : null}
        </CardContent>
      </Card>

      {(claimedHere.length > 0 || claimedElsewhere.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Already paid</h2>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {[...claimedHere, ...claimedElsewhere].map((payment) => {
              const org = getOrganizerById(payment.organizerId);
              const name = chainName(payment.chainId);
              const explorer =
                payment.chainId != null
                  ? CHAINS[payment.chainId as SupportedChainId]?.explorerUrl
                  : undefined;
              return (
                <li key={payment.id} className="space-y-1 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{org?.name ?? "Payment"}</p>
                      <p className="text-sm text-muted-foreground">
                        {payment.claimedAt ? new Date(payment.claimedAt).toLocaleDateString() : "Paid"}
                        {name ? ` on ${name}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-medium">
                      {formatTokenAmount(payment.amount, tokenFor(payment))}
                    </p>
                  </div>
                  {payment.txHash && explorer ? (
                    <a
                      href={`${explorer}/tx/${payment.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all font-mono text-[11px] leading-snug text-primary hover:underline"
                    >
                      {payment.txHash}
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
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
