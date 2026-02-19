"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
} from "@/lib/store";

export default function ReceiveDashboard() {
  const { embedded } = useAccount();
  const address = embedded?.wallets?.[0]?.address ?? "";
  const store = useStore();

  // ensure current user exists as subscriber
  const [subId, setSubId] = useState("");
  useEffect(() => {
    if (!address) return;
    ensureSubscriber(address).then((sub) => setSubId(sub.id));
  }, [address]);

  const mySubscriptions = store.subscriptions.filter(
    (s) => s.subscriberId === subId
  );
  const myPayments = store.payments.filter(
    (p) => p.subscriberId === subId
  );
  const subscribedOrgIds = new Set(mySubscriptions.map((s) => s.organizerId));

  const [joining, setJoining] = useState<string | null>(null);

  const handleJoin = async (organizerId: string) => {
    if (!subId) return;
    setJoining(organizerId);
    try {
      await joinOrganizer(organizerId, subId);
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
          {store.organizers.map((org) => {
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
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Distributed</span>
                    <span className="font-medium">
                      ${org.totalDistributed.toLocaleString()}
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
          {store.organizers.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              No organizers available yet.
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
              {mySubscriptions.map((sub) => {
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
              {mySubscriptions.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No subscriptions yet. Browse organizers to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>

      {/* Payment History */}
      <TabsContent value="history">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organizer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myPayments.map((payment) => {
                const org = getOrganizerById(payment.organizerId);
                return (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">
                      {org?.name ?? payment.organizerId}
                    </TableCell>
                    <TableCell>
                      ${payment.amount.toLocaleString()}
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
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {payment.status === "claimable" && (
                        <Link href={`/receive/${payment.id}`}>
                          <Button size="sm" variant="outline" className="gap-1">
                            Claim
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      )}
                      {payment.status === "claimed" && (
                        <span className="text-xs text-muted-foreground">
                          {payment.claimedAt
                            ? new Date(payment.claimedAt).toLocaleDateString()
                            : "Claimed"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {myPayments.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No payments yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
