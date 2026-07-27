"use client";

import { useState, useEffect } from "react";
import { useAccount, useModal, useSignMessage } from "@getpara/react-sdk";
import { hexStringToBase64 } from "@getpara/core-sdk";
import { toast } from "sonner";
import { hashMessage, parseSignature, serializeSignature } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useParaWalletClient } from "@/lib/wallet";
import {
  AUTH_ADDRESS_HEADER,
  AUTH_SIGNATURE_HEADER,
  AUTH_TIMESTAMP_HEADER,
  buildWalletAuthMessage,
} from "@/lib/auth-shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogIn, ShieldCheck, User, Loader2 } from "lucide-react";

type ProfileState = "loading" | "needs-username" | "ready";
type ResolvedProfileState = Exclude<ProfileState, "loading">;

/** Survives AuthGuard remount when switching /payer ↔ /receive. */
let profileCache: { address: string; state: ResolvedProfileState } | null =
  null;

function cachedProfileFor(address: string): ResolvedProfileState | null {
  const normalized = address.toLowerCase();
  if (profileCache?.address === normalized) return profileCache.state;
  return null;
}

function normalizeParaSignature(rawSignature: string): `0x${string}` {
  const sigHex = rawSignature.startsWith("0x")
    ? (rawSignature as `0x${string}`)
    : (`0x${rawSignature}` as `0x${string}`);
  const parsed = parseSignature(sigHex);
  return serializeSignature({
    r: parsed.r,
    s: parsed.s,
    yParity: parsed.yParity,
  });
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, embedded } = useAccount();
  const { openModal } = useModal();
  const embeddedWallet = embedded?.wallets?.[0];
  const fallbackAddress = embeddedWallet?.address ?? "";
  const { address: walletAddress } = useParaWalletClient();
  const { signMessageAsync } = useSignMessage();
  const address = walletAddress ?? fallbackAddress;
  const walletId = embeddedWallet?.id;

  const [profileState, setProfileState] = useState<ProfileState>(() => {
    if (!address) return "loading";
    return cachedProfileFor(address) ?? "loading";
  });
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setProfileState("loading");
      return;
    }

    const normalized = address.toLowerCase();
    const cached = cachedProfileFor(address);
    // Remount / route switch: keep prior ready state — no spinner flash.
    if (cached) {
      setProfileState(cached);
    } else {
      setProfileState("loading");
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/subscribers?address=${encodeURIComponent(address)}`
        );
        if (cancelled) return;
        let next: ResolvedProfileState = "needs-username";
        if (res.ok) {
          const data = await res.json();
          if (data?.name) next = "ready";
        }
        profileCache = { address: normalized, state: next };
        setProfileState(next);
      } catch {
        if (!cancelled) {
          // Keep cached ready if revalidation failed mid-session.
          if (!cached) setProfileState("needs-username");
        }
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
    if (!address) {
      toast.error("Wallet address not available");
      return;
    }
    if (!walletId) {
      toast.error("Embedded wallet not available");
      return;
    }

    setSaving(true);
    try {
      const timestamp = String(Date.now());
      const message = buildWalletAuthMessage(address, timestamp);
      const hashedMessage = hashMessage(message);
      const signatureRes = await signMessageAsync({
        walletId,
        messageBase64: hexStringToBase64(hashedMessage),
      });
      const rawSignature =
        signatureRes && "signature" in signatureRes
          ? signatureRes.signature
          : undefined;
      if (!rawSignature) {
        throw new Error("Wallet signature requires additional confirmation");
      }
      const signature = normalizeParaSignature(rawSignature);
      const authHeaders = {
        [AUTH_ADDRESS_HEADER]: address.toLowerCase(),
        [AUTH_SIGNATURE_HEADER]: signature,
        [AUTH_TIMESTAMP_HEADER]: timestamp,
      };
      const res = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ address, name: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          body && typeof body.error === "string"
            ? body.error
            : "Failed to save username";
        throw new Error(message);
      }
      profileCache = { address: address.toLowerCase(), state: "ready" };
      setProfileState("ready");
      toast.success(`Welcome, ${trimmed}!`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save username";
      toast.error(message);
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
              disabled={saving || !username.trim() || !walletId}
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Continue"
              )}
            </Button>
            {!walletId ? (
              <p className="text-xs text-muted-foreground">
                Connecting embedded wallet...
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
