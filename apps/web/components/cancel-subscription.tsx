"use client";

import { useState } from "react";
import { postJson } from "@/lib/relay-client";
import { cancelSubscriptionRequest } from "@/lib/typed-data";
import { useSignedAction } from "@/lib/use-signed-action";

// Cancels with one signature, from the subscriber or from the plan's merchant. It can't be undone,
// so it asks first.
export function CancelSubscription({
  id,
  onChanged,
}: {
  id: bigint;
  onChanged: () => Promise<unknown>;
}) {
  const action = useSignedAction();
  const [confirming, setConfirming] = useState(false);

  async function cancel() {
    const typed = cancelSubscriptionRequest(id);
    const data = await action.run(typed, (signature) =>
      postJson("/api/relay/subscriptions/cancel", {
        id,
        deadline: typed.message.deadline,
        signature,
      }),
    );
    if (data) await onChanged();
  }

  return (
    <>
      {confirming ? (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn"
            disabled={action.busy}
            onClick={() => setConfirming(false)}
          >
            Keep it
          </button>
          <button type="button" className="btn text-late" disabled={action.busy} onClick={cancel}>
            {action.label("Yes, cancel", "Cancelling…")}
          </button>
        </div>
      ) : (
        <button type="button" className="btn text-late" onClick={() => setConfirming(true)}>
          Cancel
        </button>
      )}
      {action.error && (
        <p role="alert" className="mt-1.5 text-[13px]/[18px] text-late">
          {action.error}
        </p>
      )}
    </>
  );
}
