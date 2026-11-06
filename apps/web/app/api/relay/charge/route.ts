import { chargeSubscription } from "@/lib/server/charge";
import { relayRoute, uintField } from "@/lib/server/relay-http";
import { readPlan, readSubscription } from "@/lib/server/subscriptions";

export const maxDuration = 60;

// Collects one subscription's payment if it is due.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const subscription = await readSubscription(uintField(body.id));
    const plan = await readPlan(subscription.planId);
    return { txHash: await chargeSubscription(subscription, plan) };
  });
}
