"use client";

import { AuthGuard } from "@/components/auth-guard";
import { PageShell } from "@/components/page-shell";

export default function ReceiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <PageShell
        title="Recipient Dashboard"
        description="Manage subscriptions and claim payments. Redeem an invite to join an organization."
      >
        {children}
      </PageShell>
    </AuthGuard>
  );
}
