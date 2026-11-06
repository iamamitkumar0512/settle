import { parseEventLogs } from "viem";
import { subscriptions } from "@/lib/contracts";
import { coversOpenInvoice, relayFees } from "@/lib/server/gas-fee";
import { allow, DAY } from "@/lib/server/rate-limit";
import {
  addressField,
  bytes32Field,
  checkWindow,
  relayRoute,
  signatureField,
  uint32Field,
  uintField,
  vrsFields,
} from "@/lib/server/relay-http";
import { relay, RelayError } from "@/lib/server/relayer";
import { readPlan } from "@/lib/server/subscriptions";

export const maxDuration = 60;

// Subscribing costs the relayer more gas than the plan's fee repays, so it is capped.
const SUBSCRIBES_PER_DAY = 10;

// One relay per customer and plan at a time, so a double click can't send two transactions.
const inFlight = new Set<string>();

// Starts a subscription the customer signed, and collects its first period.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const fields = (body.request ?? {}) as Record<string, unknown>;
    const subscribe = {
      planId: uintField(fields.planId),
      subscriber: addressField(fields.subscriber),
      periods: uint32Field(fields.periods),
      salt: bytes32Field(fields.salt),
      deadline: uintField(fields.deadline),
    };
    const signature = signatureField(body.signature);
    const permitFields = (body.permit ?? {}) as Record<string, unknown>;
    const permit = {
      value: uintField(permitFields.value),
      deadline: uintField(permitFields.deadline),
      ...vrsFields(permitFields),
    };
    checkWindow(subscribe.deadline);

    const plan = await readPlan(subscribe.planId);
    if (!plan.active) throw new RelayError(409, "PlanNotOpen");
    const { chargeFee } = await relayFees();
    if (!coversOpenInvoice(plan.relayFee, chargeFee)) {
      throw new RelayError(400, "relay_fee_too_low");
    }
    if (!allow(`subscribe:${subscribe.subscriber.toLowerCase()}`, SUBSCRIBES_PER_DAY, DAY)) {
      throw new RelayError(429, "daily_limit_reached");
    }

    const key = `${subscribe.planId}:${subscribe.subscriber.toLowerCase()}`;
    if (inFlight.has(key)) throw new RelayError(409, "payment_in_progress");
    inFlight.add(key);
    try {
      const { hash, receipt } = await relay({
        address: subscriptions.address,
        abi: subscriptions.abi,
        functionName: "subscribeFor",
        args: [subscribe, signature, permit],
      });
      const [started] = parseEventLogs({
        abi: subscriptions.abi,
        eventName: "Subscribed",
        logs: receipt.logs,
      });
      return { id: String(started.args.id), txHash: hash };
    } finally {
      inFlight.delete(key);
    }
  });
}
