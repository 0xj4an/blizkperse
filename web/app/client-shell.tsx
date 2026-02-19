"use client";

import { Providers } from "@/components/providers";
import { ChainProvider } from "@/lib/chain-context";
import { Toaster } from "@/components/ui/sonner";

export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <ChainProvider>
        {children}
        <Toaster richColors position="bottom-right" />
      </ChainProvider>
    </Providers>
  );
}
