"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "blizkperse-claim-destination-tip";

export function hasSeenClaimDestinationTip(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markClaimDestinationTipSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}

type ClaimDestinationTipProps = {
  children: ReactNode;
  /** When false, tip never shows (e.g. already claimed). */
  enabled?: boolean;
};

/**
 * One-time coachmark that highlights the destination address field until the
 * user dismisses it with "I understand". Backdrop blocks the rest of the UI.
 */
export function ClaimDestinationTip({
  children,
  enabled = true,
}: ClaimDestinationTipProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return;
    }
    setOpen(!hasSeenClaimDestinationTip());
  }, [enabled]);

  const dismiss = () => {
    markClaimDestinationTipSeen();
    setOpen(false);
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/65"
          aria-hidden
          // Intentionally no onClick — user must press "I understand".
        />
      )}
      <div className={cn("relative space-y-2", open && "z-50")}>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="claim-destination-tip-title"
            className="absolute left-0 right-0 bottom-full z-50 mb-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: [0, -5, 0] }}
            transition={{
              opacity: { duration: 0.25 },
              y: {
                duration: 2.8,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.25,
              },
            }}
          >
            <div
              className="absolute -bottom-2 left-6 size-4 rotate-45 border-r border-b border-border bg-popover"
              aria-hidden
            />
            <p
              id="claim-destination-tip-title"
              className="text-sm leading-relaxed text-foreground"
            >
              You can receive your funds in a different address — just paste it
              here. By default you receive them in the connected wallet. You
              don&apos;t need gas to claim, but you still need gas token to move
              your funds afterward.
            </p>
            <Button className="mt-3 w-full sm:w-auto" onClick={dismiss}>
              I understand
            </Button>
          </motion.div>
        )}
        <div
          className={cn(
            "rounded-md transition-[box-shadow,ring] duration-200",
            open && "ring-2 ring-accent ring-offset-2 ring-offset-background",
          )}
        >
          {children}
        </div>
      </div>
    </>
  );
}
