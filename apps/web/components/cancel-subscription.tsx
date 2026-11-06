"use client";

import { postJson } from "@/lib/relay-client";
import { cancelSubscriptionRequest } from "@/lib/typed-data";
import { useSignedAction } from "@/lib/use-signed-action";

// Cancels with one signature, from the subscriber or from the plan's merchant.
export function CancelSubscription({
  id,
  onChanged,
}: {
  id: bigint;
  onChanged: () => Promise<unknown>;
}) {
  const action = useSignedAction();

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
      <button type="button" className="btn text-late" disabled={action.busy} onClick={cancel}>
        {action.label("Cancel", "Cancelling…")}
      </button>
      {action.error && (
        <p role="alert" className="mt-1.5 text-[13px]/[18px] text-late">
          {action.error}
        </p>
      )}
    </>
  );
}
