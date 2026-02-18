"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAccount } from "@getpara/react-sdk";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Users, CircleDollarSign, Clock, Building2, Loader2 } from "lucide-react";
import {
  useStore,
  getSubscriberById,
  createOrganizer,
} from "@/lib/store";

export default function PayerDashboard() {
  const { embedded } = useAccount();
  const address = embedded?.wallets?.[0]?.address ?? "";
  const store = useStore();

  const myOrganizers = store.organizers.filter(
    (o) => o.address.toLowerCase() === address.toLowerCase()
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

  const totalDistributed = orgPayouts.reduce((s, p) => s + p.totalAmount, 0);
  const pendingPayouts = orgPayouts.filter(
    (p) => p.status === "deposited" || p.status === "pending"
  ).length;

  const [createOpen, setCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      const org = await createOrganizer({ name: newOrgName.trim(), address });
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

  return (
    <div className="space-y-8">
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
        <Card className="glass">
          <CardContent className="py-12 text-center text-muted-foreground">
            Create an organization to start distributing payouts.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="glass">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <CircleDollarSign className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Distributed</p>
                  <p className="text-2xl font-bold">${totalDistributed.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Subscribers</p>
                  <p className="text-2xl font-bold">{orgSubs.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending Payouts</p>
                  <p className="text-2xl font-bold">{pendingPayouts}</p>
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
          <Card className="glass overflow-hidden">
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
          <Card className="glass overflow-hidden">
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
                {orgPayouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(payout.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {store.payments.filter((p) => p.payoutId === payout.id).length}
                    </TableCell>
                    <TableCell className="font-medium">
                      ${payout.totalAmount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          payout.status === "distributed"
                            ? "default"
                            : payout.status === "deposited"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {payout.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {orgPayouts.length === 0 && (
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
