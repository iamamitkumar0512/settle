import { registry } from "@/lib/contracts";
import { InvoiceStatus } from "@/lib/invoice";
import { addressField, checkWindow, relayRoute, uintField, vrsFields } from "@/lib/server/relay-http";
import { coversOpenInvoice, relayFees } from "@/lib/server/gas-fee";
import { MIN_INVOICE, readInvoice, relay, RelayError } from "@/lib/server/relayer";

// One relay per invoice at a time, so a double click can't send two transactions.
const inFlight = new Set<string>();

// Submits a customer's signed payment. The relayer pays the gas and the invoice's fee repays it.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const id = uintField(body.invoiceId);
    const payer = addressField(body.payer);
    const validAfter = uintField(body.validAfter);
    const validBefore = uintField(body.validBefore);
    const { v, r, s } = vrsFields(body);
    checkWindow(validBefore);

    const { invoice } = await readInvoice(id);
    if (invoice.status !== InvoiceStatus.Open) throw new RelayError(409, "InvoiceNotOpen");
    if (invoice.amount < MIN_INVOICE) throw new RelayError(400, "invoice_too_small");
    const { payFee } = await relayFees();
    if (!coversOpenInvoice(invoice.relayFee, payFee)) {
      throw new RelayError(400, "relay_fee_too_low");
    }

    const key = String(id);
    if (inFlight.has(key)) throw new RelayError(409, "payment_in_progress");
    inFlight.add(key);
    try {
      const { hash } = await relay({
        address: registry.address,
        abi: registry.abi,
        functionName: "payWithAuthorization",
        args: [id, payer, validAfter, validBefore, v, r, s],
      });
      return { txHash: hash };
    } finally {
      inFlight.delete(key);
    }
  });
}
