"use client";

import { useEffect, useRef, useState } from "react";
import { postJson, relayErrorMessage } from "./relay-client";
import type { Subscription } from "./subscription";

const WAIT_AFTER_FAILURE_MS = 5 * 60_000;
// The browser's clock can be a moment ahead of the chain's.
const WAIT_WHEN_EARLY_MS = 10_000;

// Collects a payment as soon as it is due, whenever the merchant or the customer has Settle open.
// The daily job collects whatever nobody was here to see. Anyone may ask for a due payment: the
// contract checks it is due, and the plan's fee repays the gas.
export function useAutoCollect(due: Subscription[], onCollected: () => Promise<unknown>) {
  const nextTry = useRef(new Map<string, number>());
  const [collecting, setCollecting] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());

  async function collect(id: bigint) {
    const key = String(id);
    setCollecting((current) => new Set(current).add(key));
    const result = await postJson("/api/relay/charge", { id });
    setCollecting((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });

    if (result.ok) {
      nextTry.current.delete(key);
      setErrors((current) => {
        const next = new Map(current);
        next.delete(key);
        return next;
      });
      await onCollected();
    } else if (result.error === "NotDue" || result.error === "payment_in_progress") {
      nextTry.current.set(key, Date.now() + WAIT_WHEN_EARLY_MS);
    } else {
      setErrors((current) => new Map(current).set(key, relayErrorMessage(result.error)));
    }
  }

  // Runs on every render, and the caller's clock renders it, so a payment is tried soon after it
  // falls due.
  useEffect(() => {
    for (const { id } of due) {
      const key = String(id);
      if (Date.now() < (nextTry.current.get(key) ?? 0)) continue;
      nextTry.current.set(key, Date.now() + WAIT_AFTER_FAILURE_MS);
      void collect(id);
    }
  });

  return { collecting, errors, collect };
}
