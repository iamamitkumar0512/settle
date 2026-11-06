import { parseEventLogs } from "viem";
import { subscriptions } from "@/lib/contracts";
import { coversNewRequest, relayFees } from "@/lib/server/gas-fee";
import {
  addressField,
  bytes32Field,
  checkWindow,
  relayRoute,
  signatureField,
  uint32Field,
  uintField,
} from "@/lib/server/relay-http";
import { MIN_INVOICE, relay, RelayError, spendFreeRelay } from "@/lib/server/relayer";

export const maxDuration = 60;

const PLANS_PER_DAY = 20;

// Publishes a subscription plan the merchant signed.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const fields = (body.request ?? {}) as Record<string, unknown>;
    const plan = {
      merchant: addressField(fields.merchant),
      amount: uintField(fields.amount),
      period: uint32Field(fields.period),
      ref: bytes32Field(fields.ref),
      relayFee: uintField(fields.relayFee),
      salt: bytes32Field(fields.salt),
      deadline: uintField(fields.deadline),
    };
    const signature = signatureField(body.signature);
    checkWindow(plan.deadline);

    if (plan.amount < MIN_INVOICE) throw new RelayError(400, "invoice_too_small");
    const { chargeFee } = await relayFees();
    if (!coversNewRequest(plan.relayFee, chargeFee)) {
      throw new RelayError(400, "relay_fee_too_low");
    }
    spendFreeRelay("plan", plan.merchant, PLANS_PER_DAY);

    const { hash, receipt } = await relay({
      address: subscriptions.address,
      abi: subscriptions.abi,
      functionName: "createPlanFor",
      args: [plan, signature],
    });
    const [created] = parseEventLogs({
      abi: subscriptions.abi,
      eventName: "PlanCreated",
      logs: receipt.logs,
    });
    return { planId: String(created.args.planId), txHash: hash };
  });
}
