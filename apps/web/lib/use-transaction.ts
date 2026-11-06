"use client";

import { useState } from "react";
import type { Hash } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { whitechainSepolia } from "./chains";
import { isInsufficientGas, isUserRejection, revertName } from "./wallet-errors";

export type TransactionPhase = "idle" | "wallet" | "confirming";

function errorMessage(error: unknown, fallback: string) {
  if (isUserRejection(error)) return "You cancelled in your wallet. Nothing changed.";
  if (isInsufficientGas(error)) return "This wallet doesn't have enough WBT for gas.";
  if (revertName(error) === "InvoiceNotOpen") return "This invoice was just paid or cancelled.";
  return fallback;
}

// Runs one wallet transaction through to its receipt and tracks its progress.
export function useTransaction() {
  const client = usePublicClient({ chainId: whitechainSepolia.id });
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<TransactionPhase>("idle");
  const [error, setError] = useState<string>();
  const [sentHash, setSentHash] = useState<Hash>();

  async function run(send: () => Promise<Hash>, failure: string) {
    setError(undefined);
    setSentHash(undefined);
    setPhase("wallet");

    let hash: Hash;
    try {
      hash = await send();
    } catch (cause) {
      setError(errorMessage(cause, failure));
      setPhase("idle");
      return null;
    }

    setSentHash(hash);
    setPhase("confirming");
    try {
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setError(failure);
        return null;
      }
      return hash;
    } catch {
      // It may still land, so a retry here could send it twice.
      setError("We couldn't confirm this transaction. Check it before trying again.");
      return null;
    } finally {
      setPhase("idle");
    }
  }

  return { client, writeContractAsync, run, phase, error, sentHash };
}
