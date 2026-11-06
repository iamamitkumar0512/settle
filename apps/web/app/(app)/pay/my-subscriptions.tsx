"use client";

import { CancelSubscription } from "@/components/cancel-subscription";
import { formatDateTime, formatUsdt, periodLabel, shortAddress } from "@/lib/format";
import { usePlanDetails } from "@/lib/use-plan-details";
import { useSession } from "@/lib/use-session";
import { usePlans, useSubscriptions } from "@/lib/use-subscriptions";

// The account's running subscriptions. Past ones are left out: nothing more is collected.
export function MySubscriptions() {
  const { address } = useSession();
  const plans = usePlans();
  const subscriptions = useSubscriptions();
  const planDetails = usePlanDetails();

  const mine = subscriptions.subscriptions
    .filter(
      (subscription) =>
        subscription.active && subscription.subscriber.toLowerCase() === address?.toLowerCase(),
    )
    .reverse();
  if (mine.length === 0) return null;

  return (
    <section aria-label="Subscriptions" className="flex flex-col gap-3">
      <h2 className="display text-xl">Subscriptions</h2>
      <ul className="flex flex-col gap-3">
        {mine.map((subscription) => {
          const plan = plans.plans.find(({ id }) => id === subscription.planId);
          const details = planDetails(subscription.planId);
          return (
            <li
              key={String(subscription.id)}
              className="card flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="display text-lg">
                    {details ? (
                      `${details.name} from ${details.merchantName}`
                    ) : plan ? (
                      <>
                        Plan <span className="figure">#{String(plan.id)}</span> from{" "}
                        <span className="figure">{shortAddress(plan.merchant)}</span>
                      </>
                    ) : (
                      "Subscription"
                    )}
                  </span>
                  <span className="pill tone-paid">Active</span>
                </div>
                <p className="mt-1 text-[13px]/[18px] text-muted">
                  Next payment {formatDateTime(new Date(Number(subscription.nextChargeAt) * 1000))} ·{" "}
                  {subscription.periodsLeft} {subscription.periodsLeft === 1 ? "payment" : "payments"}{" "}
                  left
                </p>
              </div>
              <div className="flex items-center gap-4">
                {plan && (
                  <span className="text-right">
                    <span className="figure block text-lg">{formatUsdt(plan.amount)} USDT</span>
                    <span className="block text-[13px]/[18px] text-muted">
                      {periodLabel(plan.period)}
                    </span>
                  </span>
                )}
                <div>
                  <CancelSubscription id={subscription.id} onChanged={subscriptions.refetch} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
