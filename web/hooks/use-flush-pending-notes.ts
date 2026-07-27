"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useApiAuth } from "@/lib/api-auth";
import { useParaWalletClient } from "@/lib/wallet";
import {
  attachDepositTxToOnlyPendingNote,
  attachDepositTxToPendingNote,
  flushPendingNoteSecrets,
  hasFlushablePendingNoteSecrets,
  invalidateAndRefetchStore,
  peekPendingNoteSecretsMeta,
} from "@/lib/store";

declare global {
  interface Window {
    /** Safe peek — no secret fields. */
    __blizPeekPendingNotes?: typeof peekPendingNoteSecretsMeta;
    /** Manual recovery: attachDepositTx(paymentId, depositTx, commitment?) */
    __blizAttachDepositTx?: typeof attachDepositTxToPendingNote;
    /** If exactly one pending note: attachDepositTxToOnly(depositTx) */
    __blizAttachDepositTxToOnly?: typeof attachDepositTxToOnlyPendingNote;
    /** Manual recovery: flush pending note secrets (prompts wallet sign). */
    __blizFlushPendingNotes?: () => Promise<number>;
    /**
     * One-shot: optional depositTx attach + POST /api/notes via flush.
     * await __blizRecoverPendingNotes('0x…')
     */
    __blizRecoverPendingNotes?: (depositTx?: string) => Promise<number>;
  }
}

/**
 * On any authenticated organizer surface: if localStorage still has note secrets
 * with a confirmed deposit_tx, POST them so payments become claimable.
 * Previously this only ran on /payer/create — dashboard reload left "Awaiting deposit".
 */
export function useFlushPendingNotes(enabled = true) {
  const apiAuth = useApiAuth();
  const { walletClient, address, isReady } = useParaWalletClient();

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const flush = async () => {
      if (!address) throw new Error("Wallet not connected — open /payer logged in");
      const saved = await flushPendingNoteSecrets({
        ...apiAuth,
        walletClient,
        address,
      });
      if (saved > 0) invalidateAndRefetchStore();
      return saved;
    };

    window.__blizPeekPendingNotes = peekPendingNoteSecretsMeta;
    window.__blizAttachDepositTx = attachDepositTxToPendingNote;
    window.__blizAttachDepositTxToOnly = attachDepositTxToOnlyPendingNote;
    window.__blizFlushPendingNotes = flush;
    window.__blizRecoverPendingNotes = async (depositTx?: string) => {
      if (depositTx) {
        const meta = peekPendingNoteSecretsMeta();
        if (meta.length === 0) {
          console.warn("[bliz] No pending notes in localStorage");
          return 0;
        }
        if (meta.length === 1) {
          attachDepositTxToOnlyPendingNote(depositTx);
        } else {
          for (const m of meta) {
            if (!m.has_deposit_tx) {
              attachDepositTxToPendingNote(m.payment_id, depositTx);
            }
          }
        }
      }
      console.info("[bliz] pending meta:", peekPendingNoteSecretsMeta());
      if (!hasFlushablePendingNoteSecrets()) {
        console.warn(
          "[bliz] Still no deposit_tx — pass the deposit hash: await __blizRecoverPendingNotes('0x…')",
        );
        return 0;
      }
      return flush();
    };

    return () => {
      delete window.__blizPeekPendingNotes;
      delete window.__blizAttachDepositTx;
      delete window.__blizAttachDepositTxToOnly;
      delete window.__blizFlushPendingNotes;
      delete window.__blizRecoverPendingNotes;
    };
  }, [enabled, apiAuth, walletClient, address]);

  useEffect(() => {
    if (!enabled || !isReady || !address) return;
    if (!hasFlushablePendingNoteSecrets()) return;

    let cancelled = false;
    (async () => {
      try {
        const saved = await flushPendingNoteSecrets({
          ...apiAuth,
          walletClient,
          address,
        });
        if (cancelled) return;
        if (saved > 0) {
          toast.success(`Recovered ${saved} pending note(s) from local backup.`);
          invalidateAndRefetchStore();
        }
      } catch (err) {
        console.error("Pending note secret recovery failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, isReady, address, apiAuth, walletClient]);
}
