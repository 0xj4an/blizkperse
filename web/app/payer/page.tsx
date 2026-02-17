"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Users, CircleDollarSign, Clock } from "lucide-react";
import {
  CURRENT_PAYER_ID,
  getPayerById,
  getRegistrationsForPayer,
  getPayoutsForPayer,
  getParticipantById,
} from "@/lib/mock-data";

export default function PayerDashboard() {
  const payer = getPayerById(CURRENT_PAYER_ID)!;
  const regs = getRegistrationsForPayer(CURRENT_PAYER_ID);
  const payouts = getPayoutsForPayer(CURRENT_PAYER_ID);

  const totalDistributed = payouts.reduce((s, p) => s + p.totalAmount, 0);
  const pendingPayouts = payouts.filter(
    (p) => p.status === "deposited" || p.status === "pending"
  ).length;

  return (
    <div className="space-y-8">
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
              <p className="text-sm text-muted-foreground">Participants</p>
              <p className="text-2xl font-bold">{regs.length}</p>
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
        <h2 className="text-xl font-semibold">Registered Participants</h2>
        <Link href="/payer/create">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Create Payout
          </Button>
        </Link>
      </div>

      {/* Participants Table */}
      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {regs.map((reg) => {
              const p = getParticipantById(reg.participantId);
              if (!p) return null;
              return (
                <TableRow key={reg.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.address.slice(0, 6)}...{p.address.slice(-4)}
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
            {payouts.map((payout) => (
              <TableRow key={payout.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(payout.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>{payout.participants.length}</TableCell>
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
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
