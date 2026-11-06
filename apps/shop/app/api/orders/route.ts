import { PRODUCTS } from "@/lib/products";
import { settle } from "@/lib/settle";

export async function POST(request: Request) {
  const { product } = await request.json();
  const item = PRODUCTS.find(({ id }) => id === product);
  if (!item) return Response.json({ error: "unknown_product" }, { status: 400 });

  // #region settle
  const order = await settle().orders.create({
    amount: item.price,
    description: item.name,
    receipt: `chai-${Date.now()}`,
    callbackUrl: new URL("/thanks", request.url).href,
  });
  return Response.json({ id: order.id });
  // #endregion
}
