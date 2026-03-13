"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const IS_PROD = process.env.NEXT_PUBLIC_BLIZ_ENV === "production";
const PARA_API_KEY = IS_PROD
  ? (process.env.NEXT_PUBLIC_PARA_API_KEY ?? "")
  : (process.env.NEXT_PUBLIC_PARA_API_KEY_BETA ?? process.env.NEXT_PUBLIC_PARA_API_KEY ?? "");

const ParaWrapper = dynamic(
  () => import("./para-wrapper").then((m) => m.ParaWrapper),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  if (!PARA_API_KEY) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ParaWrapper apiKey={PARA_API_KEY}>{children}</ParaWrapper>
    </QueryClientProvider>
  );
}
