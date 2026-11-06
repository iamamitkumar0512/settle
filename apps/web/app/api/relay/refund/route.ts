import { registry } from "@/lib/contracts";
import { checkWindow, relayRoute, uintField, vrsFields } from "@/lib/server/relay-http";
import { readInvoice, relay, spendFreeRelay } from "@/lib/server/relayer";

const REFUNDS_PER_DAY = 20;

// Submits a refund the merchant signed. The contract rejects it unless the merchant did.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const id = uintField(body.invoiceId);
    const amount = uintField(body.amount);
    const validAfter = uintField(body.validAfter);
    const validBefore = uintField(body.validBefore);
    const { v, r, s } = vrsFields(body);
    checkWindow(validBefore);

    const { invoice } = await readInvoice(id);
    spendFreeRelay("refund", invoice.merchant, REFUNDS_PER_DAY);

    const { hash } = await relay({
      address: registry.address,
      abi: registry.abi,
      functionName: "refundWithAuthorization",
      args: [id, amount, validAfter, validBefore, v, r, s],
    });
    return { txHash: hash };
  });
}
