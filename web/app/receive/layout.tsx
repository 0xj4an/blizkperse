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
        title="Get paid"
        description="Payments for you. A link is enough to join a group."
      >
        {children}
      </PageShell>
    </AuthGuard>
  );
}
