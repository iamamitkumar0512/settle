import type { Hash } from "viem";

// Where a store wants its customer sent after paying. It must be https. A store still in
// development may use plain http on the developer's own machine.
export function isValidCallbackUrl(text: string) {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) return false;
  return url.username === "" && url.password === "";
}

// The store's page with the order and its payment added, the way a store expects them back.
// The payment id is the transaction that paid the order. It is only known right after paying.
export function storeReturnUrl(callbackUrl: string, orderId: bigint, paymentId?: Hash) {
  if (!isValidCallbackUrl(callbackUrl)) return null;
  const url = new URL(callbackUrl);
  url.searchParams.set("settle_order_id", String(orderId));
  if (paymentId) url.searchParams.set("settle_payment_id", paymentId);
  return url;
}
