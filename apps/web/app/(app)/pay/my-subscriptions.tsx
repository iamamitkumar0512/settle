"use client";

import { CancelSubscription } from "@/components/cancel-subscription";
import { cancelledBy, SubscriptionHistory } from "@/components/subscription-history";
import { formatDateTime, formatUsdt, periodLabel, shortAddress } from "@/lib/format";
import type { Plan, Subscription } from "@/lib/subscription";
import { usePlanDetails } from "@/lib/use-plan-details";
import { useSession } from "@/lib/use-session";
import type { SubscriptionRecords } from "@/lib/use-subscription-records";
import { useSubscriptionRecords } from "@/lib/use-subscription-records";
import { usePlans, useSubscriptions } from "@/lib/use-subscriptions";

// Where a subscription stands, in the customer's words.
function standing(
  subscription: Subscription,
  plan: Plan | undefined,
  records: SubscriptionRecords | undefined,
) {
  if (subscription.active && plan && !plan.active) {
    return {
      label: "Plan closed",
      tone: "",
      text: "The business closed this plan. Nothing more will be taken.",
    };
  }
  if (subscription.active) {
    const left = `${subscription.periodsLeft} ${subscription.periodsLeft === 1 ? "payment" : "payments"} left`;
    const next = formatDateTime(new Date(Number(subscription.nextChargeAt) * 1000));
    return { label: "Active", tone: "tone-paid", text: `Next payment ${next} · ${left}` };
  }
  if (subscription.periodsLeft === 0) {
    return { label: "Completed", tone: "", text: "Every payment was made." };
  }
  const when = records?.cancelled
    ? ` ${formatDateTime(records.cancelled.time)} ${cancelledBy(records.cancelled.by, subscription.subscriber, "customer")}`
    : "";
  return { label: "Cancelled", tone: "", text: `Cancelled${when}. Nothing more will be taken.` };
}

// The account's subscriptions. Running ones come first. Ended ones stay listed, so cancelling
// leaves a record with its proof instead of making the subscription vanish.
export function MySubscriptions() {
  const { address } = useSession();
  const plans = usePlans();
  const subscriptions = useSubscriptions();
  const planDetails = usePlanDetails();

  const mine = subscriptions.subscriptions
    .filter((subscription) => subscription.subscriber.toLowerCase() === address?.toLowerCase())
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.id - a.id));
  const records = useSubscriptionRecords(mine);
  if (mine.length === 0) return null;

  return (
    <section aria-label="Subscriptions" className="flex flex-col gap-3">
      <h2 className="display text-xl">Subscriptions</h2>
      <ul className="flex flex-col gap-3">
        {mine.map((subscription) => {
          const plan = plans.plans.find(({ id }) => id === subscription.planId);
          const details = planDetails(subscription.planId);
          const history = records(subscription.id);
          const { label, tone, text } = standing(subscription, plan, history);
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
                  <span className={`pill ${tone}`}>{label}</span>
                </div>
                <p className="mt-1 text-[13px]/[18px] text-muted">{text}</p>
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
                {subscription.active && (
                  <div>
                    <CancelSubscription id={subscription.id} onChanged={subscriptions.refetch} />
                  </div>
                )}
              </div>
              <SubscriptionHistory
                records={history}
                subscriber={subscription.subscriber}
                viewer="customer"
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
