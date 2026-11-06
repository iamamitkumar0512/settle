import "server-only";
import { zeroAddress } from "viem";
import { subscriptions } from "@/lib/contracts";
import { toPlan, toSubscription, type Plan, type Subscription } from "@/lib/subscription";
import { chainClient, RelayError } from "./relayer";

export async function readPlan(id: bigint): Promise<Plan> {
  const row = await chainClient.readContract({ ...subscriptions, functionName: "plans", args: [id] });
  if (row[0] === zeroAddress) throw new RelayError(404, "PlanNotFound");
  return toPlan(id, row);
}

export async function readSubscription(id: bigint): Promise<Subscription> {
  const row = await chainClient.readContract({
    ...subscriptions,
    functionName: "subscriptions",
    args: [id],
  });
  if (row[1] === zeroAddress) throw new RelayError(404, "SubscriptionNotFound");
  return toSubscription(id, row);
}

// Every active subscription whose next payment is due, with its plan.
export async function readDueSubscriptions() {
  const count = await chainClient.readContract({
    ...subscriptions,
    functionName: "nextSubscriptionId",
  });
  const ids = Array.from({ length: Number(count) - 1 }, (_, index) => BigInt(index + 1));
  if (ids.length === 0) return [];

  const rows = await chainClient.multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({ ...subscriptions, functionName: "subscriptions", args: [id] }) as const),
  });
  const now = BigInt(Math.floor(Date.now() / 1000));
  const due = rows
    .map((row, index) => toSubscription(ids[index], row))
    .filter((subscription) => subscription.active && subscription.nextChargeAt <= now);

  const plans = new Map<bigint, Plan>();
  for (const { planId } of due) {
    if (!plans.has(planId)) plans.set(planId, await readPlan(planId));
  }
  return due.map((subscription) => ({
    subscription,
    plan: plans.get(subscription.planId) as Plan,
  }));
}
