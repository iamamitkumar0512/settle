"use client";

import { useSyncExternalStore } from "react";

// The link a merchant shares. With a key, its holder can open the invoice's PDF without logging in.
export function payUrl(id: bigint | string, linkKey?: string) {
  return `${window.location.origin}/pay/${id}${linkKey ? `#k=${linkKey}` : ""}`;
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readKey() {
  return new URLSearchParams(window.location.hash.slice(1)).get("k") ?? undefined;
}

// The key from the page's link, if it has one. It is only readable in the browser.
export function usePayLinkKey() {
  return useSyncExternalStore(subscribe, readKey, () => undefined);
}
