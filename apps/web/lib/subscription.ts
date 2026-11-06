import { keccak256, stringToHex, type Address, type Hex } from "viem";

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

export const PLAN_LIMITS = {
  merchantNameBytes: 128,
  nameBytes: 128,
  descriptionBytes: 500,
} as const;

// What a customer reads before subscribing. Saved on Arkiv, and public like the plan itself.
export type PlanDetails = {
  merchantName: string;
  name: string;
  description: string;
};

// The plan's on-chain `ref`. The merchant signs it, so only the details they wrote can be saved.
export function hashPlanDetails(details: PlanDetails): Hex {
  const { merchantName, name, description } = details;
  return keccak256(stringToHex(JSON.stringify({ merchantName, name, description })));
}

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
