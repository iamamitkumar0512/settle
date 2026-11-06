"use client";

import { useState } from "react";
import type { Hex } from "viem";
import { relayErrorMessage, type RelayResult } from "./relay-client";
import { useSession, type SignableTypedData } from "./use-session";
import { isUserRejection } from "./wallet-errors";

// Runs one gasless action: the user signs, then our relayer submits it.
export function useSignedAction() {
  const session = useSession();
  const [phase, setPhase] = useState<"idle" | "signing" | "sending">("idle");
  const [error, setError] = useState<string>();

  async function run(typed: SignableTypedData, send: (signature: Hex) => Promise<RelayResult>) {
    setError(undefined);
    setPhase("signing");
    let signature: Hex;
    try {
      signature = await session.signTypedData(typed);
    } catch (cause) {
      setError(
        isUserRejection(cause)
          ? "You cancelled in your wallet. Nothing changed."
          : "We couldn't sign that. Try again.",
      );
      setPhase("idle");
      return null;
    }

    setPhase("sending");
    const result = await send(signature);
    setPhase("idle");
    if (!result.ok) {
      setError(relayErrorMessage(result.error));
      return null;
    }
    return result.data;
  }

  // Wallet users see a prompt in their wallet; email users don't see the signature at all.
  function label(idle: string, sending: string) {
    if (phase === "sending") return sending;
    if (phase === "signing") return session.kind === "wallet" ? "Confirm in your wallet" : sending;
    return idle;
  }

  return { run, label, busy: phase !== "idle", error, clearError: () => setError(undefined) };
}
