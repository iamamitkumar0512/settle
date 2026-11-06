import { after } from "next/server";
import { readAgentSales, saleState } from "@/lib/server/agent-sales";
import { authenticate } from "@/lib/server/auth";
import { relayRoute, requestOrigin } from "@/lib/server/relay-http";
import { RelayError } from "@/lib/server/relayer";
import { announceTransaction } from "@/lib/server/webhooks";

export const maxDuration = 60;

// A merchant's sales to agents, or where one order number stands. Order numbers and what was sold
// are private, so this answers only the merchant.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const account = await authenticate(body.credentials, request.headers.get("host"));
    if (!account) throw new RelayError(401, "log_in_again");

    if (typeof body.receipt === "string") {
      const [merchant] = account.wallets;
      if (!merchant) throw new RelayError(403, "not_your_account");
      const status = await saleState(merchant, body.receipt);
      // A server that died after paying never told the merchant. A delivered event is not resent.
      if (status.state === "paid") {
        const origin = requestOrigin(request);
        after(() => announceTransaction(status.sale.transaction, origin));
      }
      return status;
    }

    const sales = await Promise.all(account.wallets.map((wallet) => readAgentSales(wallet)));
    return { sales: sales.flat() };
  });
}
