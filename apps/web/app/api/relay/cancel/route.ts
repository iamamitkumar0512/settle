import { registry } from "@/lib/contracts";
import { relayRoute, signatureField, uintField } from "@/lib/server/relay-http";
import { readInvoice, relay, spendFreeRelay } from "@/lib/server/relayer";

export const maxDuration = 60;

const CANCELS_PER_DAY = 20;

export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const id = uintField(body.invoiceId);
    const deadline = uintField(body.deadline);
    const signature = signatureField(body.signature);

    const { invoice } = await readInvoice(id);
    spendFreeRelay("cancel", invoice.merchant, CANCELS_PER_DAY);

    const { hash } = await relay({
      address: registry.address,
      abi: registry.abi,
      functionName: "cancelWithSignature",
      args: [id, deadline, signature],
    });
    return { txHash: hash };
  });
}
