import "server-only";
import { subscriptions } from "@/lib/contracts";
import type { Plan, Subscription } from "@/lib/subscription";
import { coversOpenInvoice, relayFees } from "./gas-fee";
import { relay, RelayError } from "./relayer";

// One charge per subscription at a time, whoever asks for it.
const inFlight = new Set<string>();

// Collects one period that is due. The plan's fee repays the gas, so this needs no login:
// charging is open to anyone on the contract too.
export async function chargeSubscription(subscription: Subscription, plan: Plan) {
  if (!subscription.active) throw new RelayError(409, "NotActive");
  if (!plan.active) throw new RelayError(409, "PlanNotOpen");
  if (subscription.nextChargeAt > BigInt(Math.floor(Date.now() / 1000))) {
    throw new RelayError(409, "NotDue");
  }
  const { chargeFee } = await relayFees();
  if (!coversOpenInvoice(plan.relayFee, chargeFee)) throw new RelayError(400, "relay_fee_too_low");

  const key = String(subscription.id);
  if (inFlight.has(key)) throw new RelayError(409, "payment_in_progress");
  inFlight.add(key);
  try {
    const { hash } = await relay({
      address: subscriptions.address,
      abi: subscriptions.abi,
      functionName: "charge",
      args: [subscription.id],
    });
    return hash;
  } finally {
    inFlight.delete(key);
  }
}
