"use client";

import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      {children}
      <Toaster richColors position="bottom-right" />
    </Providers>
  );
}
