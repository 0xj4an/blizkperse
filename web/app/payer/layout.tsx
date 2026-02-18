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
        title="Organizer Dashboard"
        description="Manage your subscribers and distribute payouts"
      >
        {children}
      </PageShell>
    </AuthGuard>
  );
}
