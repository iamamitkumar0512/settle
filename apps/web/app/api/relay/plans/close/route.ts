import { subscriptions } from "@/lib/contracts";
import { checkWindow, relayRoute, signatureField, uintField } from "@/lib/server/relay-http";
import { relay, spendFreeRelay } from "@/lib/server/relayer";
import { readPlan } from "@/lib/server/subscriptions";

export const maxDuration = 60;

const CLOSES_PER_DAY = 20;

// Closes a plan. The contract rejects it unless the plan's merchant signed.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const planId = uintField(body.planId);
    const deadline = uintField(body.deadline);
    const signature = signatureField(body.signature);
    checkWindow(deadline);

    const plan = await readPlan(planId);
    spendFreeRelay("plan-close", plan.merchant, CLOSES_PER_DAY);

    const { hash } = await relay({
      address: subscriptions.address,
      abi: subscriptions.abi,
      functionName: "closePlanWithSignature",
      args: [planId, deadline, signature],
    });
    return { txHash: hash };
  });
}
