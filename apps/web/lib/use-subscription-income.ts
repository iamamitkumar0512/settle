"use client";

import type { Address } from "viem";
import { usePlanDetails } from "./use-plan-details";
import { useSubscriptionRecords, type SubscriptionPayment } from "./use-subscription-records";
import { usePlans, useSubscriptions } from "./use-subscriptions";

export type SubscriptionIncome = SubscriptionPayment & {
  subscriber: Address;
  planName: string;
  merchantName: string;
};

// Every payment this merchant's plans have collected, for the totals and the CSV.
export function useSubscriptionIncome(merchant: Address | undefined) {
  const plans = usePlans();
  const subscriptions = useSubscriptions();
  const planDetails = usePlanDetails();

  const mine = new Set(
    plans.plans
      .filter((plan) => plan.merchant.toLowerCase() === merchant?.toLowerCase())
      .map(({ id }) => id),
  );
  const list = subscriptions.subscriptions.filter(({ planId }) => mine.has(planId));
  const records = useSubscriptionRecords(list);

  return list.flatMap(({ id, planId, subscriber }): SubscriptionIncome[] => {
    const details = planDetails(planId);
    return (records(id)?.payments ?? []).map((payment) => ({
      ...payment,
      subscriber,
      planName: details?.name ?? `Plan ${planId}`,
      merchantName: details?.merchantName ?? "",
    }));
  });
}
