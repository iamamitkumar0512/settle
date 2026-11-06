import type { Address, Hex } from "viem";

// A merchant's recurring offer. Amounts are USDT in base units, 6 decimals.
export type Plan = {
  id: bigint;
  merchant: Address;
  amount: bigint;
  /** Seconds between charges. */
  period: number;
  /** Taken from each relayed charge to repay its gas. */
  relayFee: bigint;
  ref: Hex;
  active: boolean;
};

export type Subscription = {
  id: bigint;
  planId: bigint;
  subscriber: Address;
  nextChargeAt: bigint;
  /** Charges the subscriber still allows. */
  periodsLeft: number;
  active: boolean;
};

export type PlanRow = readonly [Address, bigint, number, bigint, Hex, boolean];
export type SubscriptionRow = readonly [bigint, Address, bigint, number, boolean];

export function toPlan(id: bigint, row: PlanRow): Plan {
  const [merchant, amount, period, relayFee, ref, active] = row;
  return { id, merchant, amount, period, relayFee, ref, active };
}

export function toSubscription(id: bigint, row: SubscriptionRow): Subscription {
  const [planId, subscriber, nextChargeAt, periodsLeft, active] = row;
  return { id, planId, subscriber, nextChargeAt, periodsLeft, active };
}
