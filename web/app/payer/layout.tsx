"use client";

import { AuthGuard } from "@/components/auth-guard";
import { PageShell } from "@/components/page-shell";

export default function PayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <PageShell
        title="Pay Dashboard"
        description="Manage your payout distributions"
      >
        {children}
      </PageShell>
    </AuthGuard>
  );
}
