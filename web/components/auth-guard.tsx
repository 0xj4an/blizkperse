"use client";

import { useAccount, useModal } from "@getpara/react-sdk";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, ShieldCheck } from "lucide-react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const { openModal } = useModal();

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="glass glow-purple max-w-md w-full text-center">
          <CardHeader className="pb-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Log In</CardTitle>
            <CardDescription className="text-base">
              Sign in to access your dashboard and manage payouts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => openModal()} size="lg" className="w-full gap-2">
              <LogIn className="h-5 w-5" />
              Log In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
