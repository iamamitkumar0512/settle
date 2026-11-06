import { parseEventLogs } from "viem";
import { subscriptions } from "@/lib/contracts";
import { hashPlanDetails } from "@/lib/subscription";
import { writePlanRecord } from "@/lib/server/arkiv";
import { coversNewRequest, relayFees } from "@/lib/server/gas-fee";
import { parsePlanDetails } from "@/lib/server/plan-details";
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

// Publishes a subscription plan the merchant signed, then saves its details, in one request.
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

    const details = parsePlanDetails(body.details);
    if (!details) throw new RelayError(400, "invalid_details");
    if (hashPlanDetails(details) !== plan.ref) throw new RelayError(400, "details_mismatch");

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
    const planId = created.args.planId;

    // The plan exists on-chain either way. If saving fails, the client can retry it.
    const saved = await writePlanRecord({
      ...details,
      id: planId,
      merchant: plan.merchant,
      amount: plan.amount,
      period: plan.period,
    }).then(
      () => true,
      () => false,
    );
    return { planId: String(planId), txHash: hash, saved };
  });
}
