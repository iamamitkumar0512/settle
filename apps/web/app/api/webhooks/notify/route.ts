import { after } from "next/server";
import { allow, MINUTE } from "@/lib/server/rate-limit";
import { bytes32Field, relayRoute, requestOrigin } from "@/lib/server/relay-http";
import { announceTransaction } from "@/lib/server/webhooks";

export const maxDuration = 60;

// A payment sent with the customer's own gas never passes through Settle, so the pay page says
// when one lands. Anyone may call this: the event is built from the chain, and an event that
// already reached the merchant is not sent twice.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const hash = bytes32Field(body.txHash);
    if (allow(`announce:${hash}`, 1, 10 * MINUTE)) {
      const origin = requestOrigin(request);
      after(() => announceTransaction(hash, origin));
    }
    return { received: true };
  });
}
