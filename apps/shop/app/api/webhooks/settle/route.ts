import { settle } from "@/lib/settle";

export async function POST(request: Request) {
  try {
    // #region settle
    const event = settle().webhooks.verify(
      await request.text(),
      request.headers.get("x-settle-signature"),
      process.env.SETTLE_WEBHOOK_SECRET,
    );
    if (event.type === "order.paid") console.log("Ship order", event.data.receipt);
    // #endregion
    return Response.json({ received: true });
  } catch {
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }
}
