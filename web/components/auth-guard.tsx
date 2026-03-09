"use client";

import { useState, useEffect } from "react";
import { useAccount, useModal } from "@getpara/react-sdk";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWalletAuthHeadersGetter } from "@/lib/api-auth";
import { useParaWalletClient } from "@/lib/wallet";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogIn, ShieldCheck, User, Loader2 } from "lucide-react";

type ProfileState = "loading" | "needs-username" | "ready";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, embedded } = useAccount();
  const { openModal } = useModal();
  const address = embedded?.wallets?.[0]?.address ?? "";
  const { walletClient } = useParaWalletClient();
  const getAuthHeaders = createWalletAuthHeadersGetter(walletClient, address);

  const [profileState, setProfileState] = useState<ProfileState>("loading");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setProfileState("loading");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/subscribers?address=${encodeURIComponent(address)}`
        );
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            if (data?.name) {
              setProfileState("ready");
            } else {
              setProfileState("needs-username");
            }
          } else {
            setProfileState("needs-username");
          }
        }
      } catch {
        if (!cancelled) setProfileState("needs-username");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const handleSaveUsername = async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      toast.error("Username is required");
      return;
    }
    if (trimmed.length < 2) {
      toast.error("Username must be at least 2 characters");
      return;
    }

    setSaving(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ address, name: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setProfileState("ready");
      toast.success(`Welcome, ${trimmed}!`);
    } catch {
      toast.error("Failed to save username. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader className="pb-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-foreground/10">
              <ShieldCheck className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Log In</CardTitle>
            <CardDescription className="text-base">
              Sign in to access your dashboard and manage payouts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => openModal()}
              size="lg"
              className="w-full gap-2"
            >
              <LogIn className="h-5 w-5" />
              Log In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (profileState === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profileState === "needs-username") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-foreground/10">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Choose a Username</CardTitle>
            <CardDescription className="text-base">
              Pick a display name before continuing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="e.g. alice.nad"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveUsername()}
              autoFocus
              maxLength={32}
            />
            <p className="text-xs text-muted-foreground">
              Wallet:{" "}
              <span className="font-mono">
                {address.slice(0, 6)}...{address.slice(-4)}
              </span>
            </p>
            <Button
              onClick={handleSaveUsername}
              size="lg"
              className="w-full gap-2"
              disabled={saving || !username.trim()}
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Continue"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
