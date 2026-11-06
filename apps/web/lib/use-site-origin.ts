"use client";

import { useSyncExternalStore } from "react";

function noChange() {
  return () => undefined;
}

// This site's address, which is only known in the browser.
export function useSiteOrigin() {
  return useSyncExternalStore(
    noChange,
    () => window.location.origin,
    () => "",
  );
}
