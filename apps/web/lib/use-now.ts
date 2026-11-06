"use client";

import { useEffect, useState } from "react";

function seconds() {
  return BigInt(Math.floor(Date.now() / 1000));
}

// The time in seconds, refreshed on a timer, so a payment turns "due" without a reload.
export function useNow(refreshMs = 15_000) {
  const [now, setNow] = useState(seconds);

  useEffect(() => {
    const timer = setInterval(() => setNow(seconds()), refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);

  return now;
}
