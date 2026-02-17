"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
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
  payers,
  CURRENT_PARTICIPANT_ID,
  getRegistrationsForParticipant,
  getPaymentsForParticipant,
  getPayerById,
} from "@/lib/mock-data";
import { registerWithPayer } from "@/lib/mock-actions";

export default function ReceiveDashboard() {
  const myRegistrations = getRegistrationsForParticipant(CURRENT_PARTICIPANT_ID);
  const myPayments = getPaymentsForParticipant(CURRENT_PARTICIPANT_ID);
  const registeredPayerIds = new Set(myRegistrations.map((r) => r.payerId));

  const [registering, setRegistering] = useState<string | null>(null);

  const handleRegister = async (payerId: string) => {
    setRegistering(payerId);
    try {
      await registerWithPayer(payerId, CURRENT_PARTICIPANT_ID);
      toast.success("Registered successfully!");
    } catch {
      toast.error("Registration failed.");
    } finally {
      setRegistering(null);
    }
  };

  return (
    <Tabs defaultValue="browse" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3 max-w-md">
        <TabsTrigger value="browse" className="gap-2">
          <Building2 className="h-4 w-4" />
          Browse
        </TabsTrigger>
        <TabsTrigger value="registrations" className="gap-2">
          <ClipboardCheck className="h-4 w-4" />
          My Regs
        </TabsTrigger>
        <TabsTrigger value="history" className="gap-2">
          <History className="h-4 w-4" />
          History
        </TabsTrigger>
      </TabsList>

      {/* Browse Payers */}
      <TabsContent value="browse" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {payers.map((payer) => {
            const isRegistered = registeredPayerIds.has(payer.id);
            return (
              <Card key={payer.id} className="glass group transition-all hover:glow-purple">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{payer.name}</CardTitle>
                    {isRegistered && (
                      <Badge variant="default" className="text-xs">
                        Registered
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Distributed</span>
                    <span className="font-medium">
                      ${payer.totalDistributed.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Participants</span>
                    <span className="font-medium">{payer.participantCount}</span>
                  </div>
                  {!isRegistered && (
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => handleRegister(payer.id)}
                      disabled={registering === payer.id}
                    >
                      {registering === payer.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Register"
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </TabsContent>

      {/* My Registrations */}
      <TabsContent value="registrations">
        <Card className="glass overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payer</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myRegistrations.map((reg) => {
                const payer = getPayerById(reg.payerId);
                return (
                  <TableRow key={reg.id}>
                    <TableCell className="font-medium">
                      {payer?.name ?? reg.payerId}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(reg.registeredAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          reg.status === "active" ? "default" : "secondary"
                        }
                      >
                        {reg.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {myRegistrations.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No registrations yet. Browse payers to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>

      {/* Payment History */}
      <TabsContent value="history">
        <Card className="glass overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myPayments.map((payment) => {
                const payer = getPayerById(payment.payerId);
                return (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">
                      {payer?.name ?? payment.payerId}
                    </TableCell>
                    <TableCell>
                      ${payment.amount.toLocaleString()} USDm
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
