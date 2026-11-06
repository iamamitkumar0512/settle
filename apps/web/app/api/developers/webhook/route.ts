import { readWebhook, readWebhookDeliveries, writeWebhook } from "@/lib/server/arkiv";
import { authenticate } from "@/lib/server/auth";
import { addressField, relayRoute, requestOrigin } from "@/lib/server/relay-http";
import { RelayError } from "@/lib/server/relayer";
import {
  isSafeWebhookUrl,
  newWebhookSecret,
  resendEvent,
  sendTestEvent,
} from "@/lib/server/webhooks";

export const maxDuration = 60;

const URL_BYTES = 500;

// A merchant's webhook settings and recent deliveries. Everything here is for that merchant only.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const account = await authenticate(body.credentials, request.headers.get("host"));
    if (!account) throw new RelayError(401, "log_in_again");
    const merchant = addressField(body.merchant);
    const isTheirs = account.wallets.some(
      (wallet) => wallet.toLowerCase() === merchant.toLowerCase(),
    );
    if (!isTheirs) throw new RelayError(403, "not_your_account");

    const current = await readWebhook(merchant);

    if (body.action === "save") {
      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (url.length > URL_BYTES || !(await isSafeWebhookUrl(url))) {
        throw new RelayError(400, "invalid_webhook_url");
      }
      // Changing the address keeps the secret, so the merchant's server needs no change.
      await writeWebhook(merchant, { url, secret: current?.secret ?? newWebhookSecret() });
    } else if (body.action === "roll") {
      if (!current) throw new RelayError(404, "no_webhook");
      await writeWebhook(merchant, { url: current.url, secret: newWebhookSecret() });
    } else if (body.action === "remove") {
      await writeWebhook(merchant, { url: "", secret: "" });
    } else if (body.action === "test") {
      if (!current) throw new RelayError(404, "no_webhook");
      return { result: await sendTestEvent(merchant, current) };
    } else if (body.action === "resend") {
      const id = typeof body.eventId === "string" ? body.eventId : "";
      const result = await resendEvent(merchant, id, requestOrigin(request));
      if (!result) throw new RelayError(404, "event_not_found");
      return { result };
    } else if (body.action !== "read") {
      throw new RelayError(400, "invalid_request");
    }

    const [webhook, deliveries] = await Promise.all([
      body.action === "read" ? current : readWebhook(merchant),
      readWebhookDeliveries(merchant),
    ]);
    return { webhook, deliveries };
  });
}
