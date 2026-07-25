"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAccount } from "@getpara/react-sdk";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Users, CircleDollarSign, Clock, Building2, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  useStore,
  getSubscriberById,
  createOrganizer,
  updateOrganizer,
  deleteOrganizer,
  invalidateAndRefetchStore,
  type Payout,
} from "@/lib/store";
import { useChain } from "@/lib/chain-context";
import { CHAINS } from "@/lib/constants";
import { useParaWalletClient } from "@/lib/wallet";
import { useApiAuth } from "@/lib/api-auth";
import { WalletBalances } from "@/components/wallet-balances";

function isSpanishUi(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.language.toLowerCase().startsWith("es");
}

function payoutStatusLabel(status: Payout["status"]): string {
  const es = isSpanishUi();
  switch (status) {
    case "pending":
      return es ? "Pendiente de depósito" : "Awaiting deposit";
    case "deposited":
      return es ? "Listo para reclamar" : "Ready to claim";
    case "distributed":
      return es ? "Distribuido" : "Distributed";
    case "claimed":
      return es ? "Reclamado" : "Claimed";
    case "failed":
      return es ? "Fallido" : "Failed";
    default:
      return status;
  }
}

function payoutStatusVariant(
  status: Payout["status"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "distributed":
    case "claimed":
      return "default";
    case "deposited":
      return "secondary";
    case "failed":
      return "destructive";
    case "pending":
    default:
      return "outline";
  }
}

/** Deposited / distributed / claimed payouts only — never sum across tokens as one number. */
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

export default function PayerDashboard() {
  const { embedded } = useAccount();
  const address = embedded?.wallets?.[0]?.address ?? "";
  const { walletClient } = useParaWalletClient();
  const apiAuth = useApiAuth();
  const store = useStore();
  const { chainId: selectedChainId } = useChain();

  // Refetch so payout statuses (pending vs deposited) match the API/DB.
  useEffect(() => {
    invalidateAndRefetchStore();
  }, []);

  // Filter my orgs to those active on the selected chain (or with no chain-linked payments yet)
  const orgIdsOnChain = new Set<string>();
  const orgIdsWithChainPayments = new Set<string>();
  for (const p of store.payments) {
    if (p.chainId != null) {
      orgIdsWithChainPayments.add(p.organizerId);
      if (p.chainId === selectedChainId) orgIdsOnChain.add(p.organizerId);
    }
  }

  const myOrganizers = store.organizers.filter(
    (o) =>
      o.address.toLowerCase() === address.toLowerCase() &&
      (orgIdsOnChain.has(o.id) || !orgIdsWithChainPayments.has(o.id))
  );

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const selectedOrg = selectedOrgId
    ? store.organizers.find((o) => o.id === selectedOrgId)
    : myOrganizers[0];

  const orgSubs = selectedOrg
    ? store.subscriptions.filter((s) => s.organizerId === selectedOrg.id)
    : [];
  const orgPayouts = selectedOrg
    ? store.payouts.filter((p) => p.organizerId === selectedOrg.id)
    : [];
  // Recent: hide failures and abandoned empty pending drafts.
  const recentPayouts = orgPayouts.filter((p) => {
    if (p.status === "failed") return false;
    if (p.status === "pending" && p.totalAmount <= 0) return false;
    return true;
  });

  const distributedTotals = distributedByToken(orgPayouts);
  const readyToClaimPayouts = orgPayouts.filter((p) => p.status === "deposited").length;

  // Check if selected org can be deleted (no payments or all claimed/failed)
  const orgPayments = selectedOrg
    ? store.payments.filter((p) => p.organizerId === selectedOrg.id)
    : [];
  const canDelete =
    orgPayments.length === 0 ||
    orgPayments.every((p) => p.status === "claimed" || p.status === "failed");

  const [createOpen, setCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      const org = await createOrganizer({
        name: newOrgName.trim(),
        address,
        auth: { ...apiAuth, walletClient },
      });
      setSelectedOrgId(org.id);
      setNewOrgName("");
      setCreateOpen(false);
      toast.success("Organization created!");
    } catch {
      toast.error("Failed to create organization.");
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!selectedOrg || !editName.trim()) return;
    setSaving(true);
    try {
      await updateOrganizer(
        selectedOrg.id,
        { name: editName.trim() },
        { ...apiAuth, walletClient, address },
      );
      setEditOpen(false);
      toast.success("Name updated!");
    } catch {
      toast.error("Failed to rename organization.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedOrg) return;
    setDeleting(true);
    try {
      await deleteOrganizer(selectedOrg.id, { ...apiAuth, walletClient, address });
      setSelectedOrgId(null);
      toast.success("Organization deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setDeleting(false);
    }
  };

  if (!store.loaded) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Org selector + Create skeleton */}
        <div className="flex items-center gap-3 flex-wrap">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-40" />
        </div>

        {/* Title skeleton */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-48" />
        </div>

        {/* Stats skeleton */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-4 p-6">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Subtitle skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>

        {/* Table skeleton */}
        <Card>
          <div className="p-4 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <WalletBalances address={address || undefined} />

      {/* Org selector + Create */}
      <div className="flex items-center gap-3 flex-wrap">
        {myOrganizers.map((org) => (
          <Button
            key={org.id}
            variant={selectedOrg?.id === org.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedOrgId(org.id)}
            className="gap-2"
          >
            <Building2 className="h-4 w-4" />
            {org.name}
          </Button>
        ))}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New Organization
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                placeholder="Organization name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateOrg()}
              />
              <Button
                className="w-full gap-2"
                onClick={handleCreateOrg}
                disabled={creating || !newOrgName.trim()}
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Create
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!selectedOrg ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No organizations on {CHAINS[selectedChainId]?.name ?? "this network"}. Create one to start distributing payouts.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Org actions: Rename + Delete */}
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{selectedOrg.name}</h2>
            <Dialog
              open={editOpen}
              onOpenChange={(open) => {
                setEditOpen(open);
                if (open) setEditName(selectedOrg.name);
              }}
            >
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Pencil className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rename Organization</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <Input
                    placeholder="New name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRename()}
                  />
                  <Button
                    className="w-full gap-2"
                    onClick={handleRename}
                    disabled={saving || !editName.trim()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  disabled={!canDelete || deleting}
                  title={
                    canDelete
                      ? "Delete organization"
                      : "Cannot delete: unclaimed payments exist"
                  }
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete &ldquo;{selectedOrg.name}&rdquo;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the organization, its subscriptions, and all
                    associated payout records. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <CircleDollarSign className="h-6 w-6 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Total Distributed</p>
                  {distributedTotals.length === 0 ? (
                    <p className="text-2xl font-bold">—</p>
                  ) : distributedTotals.length === 1 ? (
                    <p className="text-2xl font-bold truncate">
                      {formatTokenAmount(
                        distributedTotals[0].amount,
                        distributedTotals[0].token
                      )}
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {distributedTotals.map(({ token, amount }) => (
                        <p key={token} className="text-lg font-bold leading-tight truncate">
                          {formatTokenAmount(amount, token)}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <Users className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Subscribers</p>
                  <p className="text-2xl font-bold">{orgSubs.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <Clock className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isSpanishUi() ? "Listos para reclamar" : "Ready to claim"}
                  </p>
                  <p className="text-2xl font-bold">{readyToClaimPayouts}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* CTA */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Subscribers</h2>
            <Link href={`/payer/create?org=${selectedOrg.id}`}>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Create Payout
              </Button>
            </Link>
          </div>

          {/* Subscribers Table */}
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgSubs.map((sub) => {
                  const s = getSubscriberById(sub.subscriberId);
                  if (!s) return null;
                  return (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {s.address.slice(0, 6)}...{s.address.slice(-4)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(sub.joinedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={sub.status === "active" ? "default" : "secondary"}>
                          {sub.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {orgSubs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No subscribers yet. Share your organization so people can join.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Recent Payouts */}
          <h2 className="text-xl font-semibold">Recent Payouts</h2>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(payout.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {
                        store.payments.filter(
                          (p) =>
                            p.payoutId === payout.id &&
                            (p.status === "claimable" || p.status === "claimed")
                        ).length
                      }
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatTokenAmount(payout.totalAmount, payout.token || "USDC")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={payoutStatusVariant(payout.status)}>
                        {payoutStatusLabel(payout.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {recentPayouts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No payouts yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
