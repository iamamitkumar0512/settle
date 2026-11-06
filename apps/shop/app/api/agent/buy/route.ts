import { PRODUCTS } from "@/lib/products";
import { settle } from "@/lib/settle";

const MOST_AT_ONCE = 20;

// An AI agent's order. It pays over x402, and the store's webhook ships it like any other order.
export async function POST(request: Request) {
  const { product, quantity = 1, requestId } = await request.json().catch(() => ({}));
  const item = PRODUCTS.find(({ id }) => id === product);
  if (!item) return Response.json({ error: "unknown_product" }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MOST_AT_ONCE) {
    return Response.json({ error: "invalid_quantity" }, { status: 400 });
  }
  // The agent's own id for this order. Sending it again is a retry, and is never charged twice.
  if (typeof requestId !== "string" || !/^[\w-]{1,40}$/.test(requestId)) {
    return Response.json({ error: "request_id_required" }, { status: 400 });
  }

  // #region settle
  const sale = await settle().agents.charge(request, {
    amount: (Number(item.price) * quantity).toFixed(2),
    description: `${quantity} x ${item.name}`,
    receipt: `chai-${requestId}`,
  });
  if (!sale.paid) return sale.response;
  return sale.respond({ order: sale.receipt, proof: sale.proofUrl });
  // #endregion
}
