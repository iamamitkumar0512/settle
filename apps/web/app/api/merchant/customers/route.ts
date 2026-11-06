import { isHex, verifyMessage } from "viem";
import { parseSignInMessage, SESSION_HOURS } from "@/lib/merchant-session";
import { readMerchantCustomers } from "@/lib/server/arkiv";

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

// Decrypted data goes only to the wallet that signed, and only for its own invoices.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const { message, signature } = (body ?? {}) as Record<string, unknown>;
  if (typeof message !== "string" || typeof signature !== "string" || !isHex(signature)) {
    return fail(400, "Invalid sign-in");
  }

  const session = parseSignInMessage(message);
  const now = Date.now();
  if (
    !session ||
    session.site !== request.headers.get("host") ||
    !(session.expiresAt > now) ||
    session.expiresAt > now + (SESSION_HOURS + 1) * 3_600_000
  ) {
    return fail(401, "Sign in again");
  }

  const valid = await verifyMessage({
    address: session.merchant,
    message,
    signature,
  }).catch(() => false);
  if (!valid) return fail(401, "Sign in again");

  try {
    return Response.json({ customers: await readMerchantCustomers(session.merchant) });
  } catch (error) {
    // The name only: messages can contain the keyed RPC URL.
    console.error("Reading customers failed:", error instanceof Error ? error.name : "unknown");
    return fail(502, "Couldn't load customer details");
  }
}
