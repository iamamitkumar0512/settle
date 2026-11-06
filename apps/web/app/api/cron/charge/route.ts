import { chargeSubscription } from "@/lib/server/charge";
import { RelayError } from "@/lib/server/relayer";
import { readDueSubscriptions } from "@/lib/server/subscriptions";

export const maxDuration = 60;

// Keeps one run inside the time limit. The rest are picked up by the next run.
const CHARGES_PER_RUN = 10;

// Collects every subscription payment that is due. Meant for a scheduler: with CRON_SECRET set,
// the caller must send it as a bearer token, which is what Vercel Cron does.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const due = await readDueSubscriptions();
    const charged: { id: string; txHash: string }[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const { subscription, plan } of due.slice(0, CHARGES_PER_RUN)) {
      const id = String(subscription.id);
      try {
        charged.push({ id, txHash: await chargeSubscription(subscription, plan) });
      } catch (error) {
        // A customer short of USDT fails here and is tried again on the next run.
        failed.push({ id, error: error instanceof RelayError ? error.code : "failed" });
      }
    }
    return Response.json({ due: due.length, charged, failed });
  } catch (error) {
    // The name only: messages can contain a keyed RPC URL.
    console.error("Charging subscriptions failed:", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
