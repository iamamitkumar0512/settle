"use client";

import Link from "next/link";
import { useState } from "react";
import { CancelSubscription } from "@/components/cancel-subscription";
import { formatDateTime, formatUsdt, periodLabel, shortAddress } from "@/lib/format";
import { postJson, relayErrorMessage } from "@/lib/relay-client";
import type { Plan, PlanDetails, Subscription } from "@/lib/subscription";
import { closePlanRequest } from "@/lib/typed-data";
import { useNow } from "@/lib/use-now";
import { usePlanDetails } from "@/lib/use-plan-details";
import { useSession } from "@/lib/use-session";
import { useSignedAction } from "@/lib/use-signed-action";
import { usePlans, useSubscriptions } from "@/lib/use-subscriptions";

type Refresh = () => Promise<unknown>;

function CopyLinkButton({ planId }: { planId: bigint }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(`${window.location.origin}/subscribe/${planId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className="btn" onClick={copy}>
      {copied ? "Link copied" : "Copy subscribe link"}
    </button>
  );
}

function ClosePlan({ plan, onChanged }: { plan: Plan; onChanged: Refresh }) {
  const action = useSignedAction();
  const [confirming, setConfirming] = useState(false);

  async function close() {
    const typed = closePlanRequest(plan.id);
    const data = await action.run(typed, (signature) =>
      postJson("/api/relay/plans/close", {
        planId: plan.id,
        deadline: typed.message.deadline,
        signature,
      }),
    );
    if (data) await onChanged();
  }

  if (!confirming) {
    return (
      <button type="button" className="btn text-late" onClick={() => setConfirming(true)}>
        Close plan
      </button>
    );
  }
  return (
    <div className="well flex w-full flex-col gap-3">
      <p className="text-[13px]/[18px]">
        Close this plan? Nobody new can subscribe, and no more payments are collected from its
        subscribers. This can&apos;t be undone.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn flex-1"
          disabled={action.busy}
          onClick={() => setConfirming(false)}
        >
          Keep plan
        </button>
        <button type="button" className="btn flex-1 text-late" disabled={action.busy} onClick={close}>
          {action.label("Yes, close", "Closing…")}
        </button>
      </div>
      {action.error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {action.error}
        </p>
      )}
    </div>
  );
}

// Collecting needs no signature: the contract lets anyone collect a payment that is due.
function CollectNow({ id, onChanged }: { id: bigint; onChanged: Refresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function collect() {
    setError(undefined);
    setBusy(true);
    const result = await postJson("/api/relay/charge", { id });
    if (result.ok) await onChanged();
    else setError(relayErrorMessage(result.error));
    setBusy(false);
  }

  return (
    <>
      <button type="button" className="btn btn-primary min-h-[38px]" disabled={busy} onClick={collect}>
        {busy ? "Collecting…" : "Collect now"}
      </button>
      {error && (
        <p role="alert" className="mt-1.5 text-[13px]/[18px] text-late">
          {error}
        </p>
      )}
    </>
  );
}

function SubscriberRow({
  subscription,
  planActive,
  now,
  onChanged,
}: {
  subscription: Subscription;
  planActive: boolean;
  now: bigint;
  onChanged: Refresh;
}) {
  const isDue = subscription.nextChargeAt <= now;

  return (
    <tr>
      <td className="figure">{shortAddress(subscription.subscriber)}</td>
      <td>
        {isDue ? (
          <span className="pill tone-due">Due now</span>
        ) : (
          formatDateTime(new Date(Number(subscription.nextChargeAt) * 1000))
        )}
      </td>
      <td className="figure">{subscription.periodsLeft}</td>
      <td className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          {isDue && planActive && <CollectNow id={subscription.id} onChanged={onChanged} />}
          <CancelSubscription id={subscription.id} onChanged={onChanged} />
        </div>
      </td>
    </tr>
  );
}

function PlanCard({
  plan,
  details,
  subscriptions,
  now,
  onChanged,
}: {
  plan: Plan;
  details?: PlanDetails;
  subscriptions: Subscription[];
  now: bigint;
  onChanged: Refresh;
}) {
  const active = subscriptions.filter((subscription) => subscription.active);
  const past = subscriptions.length - active.length;

  return (
    <section aria-label={`Plan ${plan.id}`} className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="display text-xl">
              {details?.name ?? (
                <>
                  Plan <span className="figure">#{String(plan.id)}</span>
                </>
              )}
            </h2>
            <span className={`pill ${plan.active ? "tone-paid" : ""}`}>
              {plan.active ? "Active" : "Closed"}
            </span>
          </div>
          {details?.description && <p className="mt-1 text-muted">{details.description}</p>}
          <p className="mt-1">
            <span className="figure">{formatUsdt(plan.amount)} USDT</span> {periodLabel(plan.period)}
          </p>
          <p className="mt-0.5 text-[13px]/[18px] text-muted">
            {details && <>Plan #{String(plan.id)} · </>}
            {active.length} active {active.length === 1 ? "subscriber" : "subscribers"}
            {past > 0 && `, ${past} ended`} · {formatUsdt(plan.relayFee)} USDT network fee per
            payment
          </p>
        </div>
        {plan.active && (
          <div className="flex flex-wrap justify-end gap-2">
            <CopyLinkButton planId={plan.id} />
            <ClosePlan plan={plan} onChanged={onChanged} />
          </div>
        )}
      </div>
      {active.length > 0 && (
        <div className="overflow-x-auto">
          <table className="data-table">
            <caption className="sr-only">Active subscribers of plan {String(plan.id)}</caption>
            <thead>
              <tr>
                <th scope="col" className="label">Subscriber</th>
                <th scope="col" className="label">Next payment</th>
                <th scope="col" className="label">Payments left</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {active.map((subscription) => (
                <SubscriberRow
                  key={String(subscription.id)}
                  subscription={subscription}
                  planActive={plan.active}
                  now={now}
                  onChanged={onChanged}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function PlansPanel() {
  const { address } = useSession();
  const plans = usePlans();
  const subscriptions = useSubscriptions();
  const planDetails = usePlanDetails();
  const now = useNow();

  async function refresh() {
    await Promise.all([plans.refetch(), subscriptions.refetch()]);
  }

  if (plans.isError || subscriptions.isError) {
    return (
      <section role="alert" className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <h2 className="display text-xl">Couldn&apos;t load your plans</h2>
        <p className="text-muted">Whitechain didn&apos;t respond. Your plans are safe on-chain.</p>
        <button type="button" className="btn" onClick={refresh}>
          Try again
        </button>
      </section>
    );
  }
  if (plans.isLoading || subscriptions.isLoading) {
    return (
      <section className="card px-6 py-16 text-center text-muted" role="status">
        Loading your plans…
      </section>
    );
  }

  const mine = plans.plans
    .filter((plan) => plan.merchant.toLowerCase() === address?.toLowerCase())
    .reverse();

  if (mine.length === 0) {
    return (
      <section className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <h2 className="display text-xl">No plans yet</h2>
        <p className="text-muted">Create a plan and share its link. Customers subscribe once.</p>
        <Link href="/plans/new" className="btn btn-primary">
          New plan
        </Link>
      </section>
    );
  }

  return (
    <>
      {mine.map((plan) => (
        <PlanCard
          key={String(plan.id)}
          plan={plan}
          details={planDetails(plan.id)}
          subscriptions={subscriptions.subscriptions.filter(({ planId }) => planId === plan.id)}
          now={now}
          onChanged={refresh}
        />
      ))}
    </>
  );
}
