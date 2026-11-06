import { PRODUCTS } from "@/lib/products";

// What an AI agent can buy here. Free to read.
export function GET() {
  return Response.json({
    currency: "USDT",
    products: PRODUCTS.map(({ id, name, detail, price }) => ({ id, name, detail, price })),
  });
}
