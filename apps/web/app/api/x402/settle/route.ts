import { after } from "next/server";
import { settleAgentSale, X402_NETWORK } from "@/lib/server/agent-sales";
import { relayRoute, requestOrigin } from "@/lib/server/relay-http";
import { announceTransaction } from "@/lib/server/webhooks";

export const maxDuration = 60;

// Long enough for the first delivery to finish and its record to reach Arkiv.
const FIRST_DELIVERY_MS = 60_000;

// x402's settle step. Unlike a plain facilitator it needs the merchant's signed gas repayment, so
// nobody can spend the relayer's WBT on a sale its merchant didn't agree to. `@akhr2405/settle-pay` adds it.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const { sale, repeat } = await settleAgentSale(body);
    // A quick retry must not send the event again while the first delivery is still under way. A
    // later one does announce, in case the first attempt died before it could.
    const firstDeliveryRunning = repeat && Date.now() - Date.parse(sale.soldAt) < FIRST_DELIVERY_MS;
    // After the response, so the merchant's server can't slow the agent down.
    const origin = requestOrigin(request);
    if (!firstDeliveryRunning) after(() => announceTransaction(sale.transaction, origin));
    return {
      success: true,
      transaction: sale.transaction,
      network: X402_NETWORK,
      payer: sale.payer,
      amount: sale.amount,
      extra: { sale, repeat },
    };
  });
}
