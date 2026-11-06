import { subscriptions } from "@/lib/contracts";
import { checkWindow, relayRoute, signatureField, uintField } from "@/lib/server/relay-http";
import { relay, spendFreeRelay } from "@/lib/server/relayer";
import { readSubscription } from "@/lib/server/subscriptions";

export const maxDuration = 60;

const CANCELS_PER_DAY = 20;

// Cancels a subscription. The contract rejects it unless the subscriber or the merchant signed.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const id = uintField(body.id);
    const deadline = uintField(body.deadline);
    const signature = signatureField(body.signature);
    checkWindow(deadline);

    const subscription = await readSubscription(id);
    spendFreeRelay("subscription-cancel", subscription.subscriber, CANCELS_PER_DAY);

    const { hash } = await relay({
      address: subscriptions.address,
      abi: subscriptions.abi,
      functionName: "cancelWithSignature",
      args: [id, deadline, signature],
    });
    return { txHash: hash };
  });
}
