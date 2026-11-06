import { isAddress } from "viem";
import { readMerchantProfile } from "@/lib/server/arkiv";

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

// Public: the business name and which invoices are store orders. Each is public already.
export async function GET(
  _request: Request,
  context: RouteContext<"/api/merchants/[address]/profile">,
) {
  const { address } = await context.params;
  if (!isAddress(address)) return fail(400, "invalid_request");

  try {
    return Response.json(await readMerchantProfile(address));
  } catch (error) {
    // The name only: messages can contain a keyed URL.
    console.error("Reading a profile failed:", error instanceof Error ? error.name : "unknown");
    return fail(502, "failed");
  }
}
