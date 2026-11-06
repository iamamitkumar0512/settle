import { hashPlanDetails } from "@/lib/subscription";
import { planRecordExists, writePlanRecord } from "@/lib/server/arkiv";
import { parsePlanDetails } from "@/lib/server/plan-details";
import { RelayError } from "@/lib/server/relayer";
import { readPlan } from "@/lib/server/subscriptions";

export const maxDuration = 60;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

// Saves a plan's details when the first attempt, made as the plan was created, didn't go through.
export async function POST(request: Request, context: RouteContext<"/api/plans/[id]/details">) {
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d{0,18}$/.test(rawId)) return fail(400, "invalid_request");
  const id = BigInt(rawId);

  const details = parsePlanDetails(await request.json().catch(() => null));
  if (!details) return fail(400, "invalid_details");

  try {
    const plan = await readPlan(id);
    // Only the details the merchant signed into the plan can be saved.
    if (hashPlanDetails(details) !== plan.ref) return fail(403, "details_mismatch");
    if (await planRecordExists(id)) return Response.json({ saved: true });

    await writePlanRecord({
      ...details,
      id,
      merchant: plan.merchant,
      amount: plan.amount,
      period: plan.period,
    });
    return Response.json({ saved: true });
  } catch (error) {
    if (error instanceof RelayError) return fail(error.status, error.code);
    // The name only: messages can contain the keyed RPC URL.
    console.error("Saving plan details failed:", error instanceof Error ? error.name : "unknown");
    return fail(502, "failed");
  }
}
