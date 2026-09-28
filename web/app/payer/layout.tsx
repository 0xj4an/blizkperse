"use client";

import { AuthGuard } from "@/components/auth-guard";
import { PageShell } from "@/components/page-shell";
import { useFlushPendingNotes } from "@/hooks/use-flush-pending-notes";

function PayerPendingNoteRecovery() {
  useFlushPendingNotes(true);
  return null;
}

export default function PayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <PayerPendingNoteRecovery />
      <PageShell
        title="Send"
        description="Pay the people in your group."
      >
        {children}
      </PageShell>
    </AuthGuard>
  );
}
