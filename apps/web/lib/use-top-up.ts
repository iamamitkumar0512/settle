"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { postJson } from "./relay-client";
import { useRelayQuote } from "./use-relay-quote";
import { useSession } from "./use-session";

const ERRORS: Record<string, string> = {
  topup_used: "You've had today's test money. Try again tomorrow.",
  topup_not_needed: "You already have test money. Use that first.",
  topup_spent: "The test money has run out for today. Try again tomorrow.",
  topup_empty: "The test money has run out for now.",
  topup_off: "Test money isn't available right now.",
  log_in_again: "Your session ended. Log in again.",
  network: "We couldn't reach Settle. Check your connection.",
};

// Asks Settle for test money. A wallet account signs in first, which costs no gas.
export function useTopUp() {
  const session = useSession();
  const { topUpAmount } = useRelayQuote();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function add(amount: bigint) {
    setBusy(true);
    setError(undefined);
    try {
      const credentials = session.credentials ?? (await session.signIn());
      const result = await postJson("/api/topup", {
        credentials,
        wallet: session.address,
        amount,
      });
      if (result.ok) await queryClient.invalidateQueries({ queryKey: ["readContract"] });
      else setError(ERRORS[result.error] ?? "That didn't work. Try again.");
    } catch {
      setError("You cancelled in your wallet. Nothing changed.");
    }
    setBusy(false);
  }

  return { limit: topUpAmount, add, busy, error };
}
