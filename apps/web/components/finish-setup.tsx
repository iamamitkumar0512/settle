"use client";

import { useState } from "react";
import { useSession } from "@/lib/use-session";

// Shown to an email account that has no wallet yet. Creating one is a single click, with no gas.
export function FinishSetup() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function finish() {
    setBusy(true);
    setFailed(false);
    try {
      await session.createWallet();
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h2 className="display text-xl">Finish setting up</h2>
      <p className="text-muted">Your account needs a wallet to hold USDT. Settle creates it for you.</p>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={finish}>
        {busy ? "One moment…" : "Create my wallet"}
      </button>
      {failed && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          That didn&apos;t work. Log out, then log in again.
        </p>
      )}
      <button type="button" className="btn" onClick={session.logout}>
        Log out
      </button>
    </div>
  );
}
