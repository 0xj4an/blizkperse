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
        description="Browse payers, manage registrations, and claim payments"
      >
        {children}
      </PageShell>
    </AuthGuard>
  );
}
