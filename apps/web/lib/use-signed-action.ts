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
  // Which signature of how many, for the wallet prompt's label.
  const [step, setStep] = useState({ current: 1, total: 1 });
  const [error, setError] = useState<string>();

  // Some actions need more than one signature. They are asked for in order, then sent together.
  async function runAll(
    requests: SignableTypedData[],
    send: (signatures: Hex[]) => Promise<RelayResult>,
  ) {
    setError(undefined);
    setPhase("signing");
    const signatures: Hex[] = [];
    try {
      for (const [index, typed] of requests.entries()) {
        setStep({ current: index + 1, total: requests.length });
        signatures.push(await session.signTypedData(typed));
      }
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
    const result = await send(signatures);
    setPhase("idle");
    if (!result.ok) {
      setError(relayErrorMessage(result.error));
      return null;
    }
    return result.data;
  }

  function run(typed: SignableTypedData, send: (signature: Hex) => Promise<RelayResult>) {
    return runAll([typed], ([signature]) => send(signature));
  }

  // Wallet users see a prompt in their wallet; email users don't see the signature at all.
  function label(idle: string, sending: string) {
    if (phase === "sending") return sending;
    if (phase !== "signing") return idle;
    if (session.kind !== "wallet") return sending;
    return step.total > 1
      ? `Confirm in your wallet (${step.current} of ${step.total})`
      : "Confirm in your wallet";
  }

  return {
    run,
    runAll,
    label,
    busy: phase !== "idle",
    error,
    clearError: () => setError(undefined),
  };
}
