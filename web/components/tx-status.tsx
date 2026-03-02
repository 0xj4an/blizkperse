"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export type TxState = "idle" | "pending" | "success" | "error";

interface TxStatusProps {
  state: TxState;
  txHash?: string;
  /** When set, shown below successMessage instead of txHash (e.g. "Received by: 0x1234...5678") */
  successDetail?: string;
  successMessage?: string;
  errorMessage?: string;
  progressMessage?: string;
}

export function TxStatus({
  state,
  txHash,
  successDetail,
  successMessage = "Transaction confirmed",
  errorMessage = "Transaction failed",
  progressMessage,
}: TxStatusProps) {
  if (state === "idle") return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center"
      >
        {state === "pending" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">
              {progressMessage ?? "Confirming transaction..."}
            </p>
          </>
        )}

        {state === "success" && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 12 }}
            >
              <CheckCircle2 className="h-10 w-10 text-green-500/80" />
            </motion.div>
            <p className="text-sm font-medium">{successMessage}</p>
            {successDetail && (
              <p className="font-mono text-xs text-muted-foreground">{successDetail}</p>
            )}
            {!successDetail && txHash && (
              <p className="font-mono text-xs text-muted-foreground">
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </p>
            )}
          </>
        )}

        {state === "error" && (
          <>
            <XCircle className="h-10 w-10 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              {errorMessage}
            </p>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
