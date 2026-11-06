import "server-only";
import { PLAN_LIMITS, type PlanDetails } from "@/lib/subscription";

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).length;
}

// Validates the details a merchant sends for a plan. All of it is public: it is the offer.
export function parsePlanDetails(body: unknown): PlanDetails | null {
  if (typeof body !== "object" || body === null) return null;
  const { merchantName, name, description } = body as Record<string, unknown>;
  if (
    typeof merchantName !== "string" ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    merchantName.trim().length === 0 ||
    name.trim().length === 0 ||
    utf8Bytes(merchantName) > PLAN_LIMITS.merchantNameBytes ||
    utf8Bytes(name) > PLAN_LIMITS.nameBytes ||
    utf8Bytes(description) > PLAN_LIMITS.descriptionBytes
  ) {
    return null;
  }
  return { merchantName, name, description };
}
