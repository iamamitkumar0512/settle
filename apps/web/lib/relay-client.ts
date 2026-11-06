import { parseSignature, type Hex } from "viem";

export type RelayResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export async function postJson(path: string, body: unknown): Promise<RelayResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body, (_, value) => (typeof value === "bigint" ? String(value) : value)),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) return { ok: true, data };
    return { ok: false, error: typeof data.error === "string" ? data.error : "failed" };
  } catch {
    return { ok: false, error: "network" };
  }
}

// The contract and the token take a signature as its three parts.
export function splitSignature(signature: Hex) {
  const { r, s, v, yParity } = parseSignature(signature);
  return { v: Number(v ?? BigInt(yParity + 27)), r, s };
}

const MESSAGES: Record<string, string> = {
  InvoiceNotOpen: "This invoice was already paid or cancelled.",
  InvoiceNotFound: "This invoice doesn't exist.",
  NotRefundable: "This invoice hasn't been paid, so there's nothing to refund.",
  RefundTooLarge: "That's more than can still be refunded.",
  FeeTooLarge: "That amount doesn't cover the network fee.",
  PlanNotOpen: "This plan is closed.",
  PlanNotFound: "This plan doesn't exist.",
  AlreadySubscribed: "You're already subscribed to this plan.",
  NotActive: "This subscription has already ended.",
  NotDue: "This payment isn't due yet.",
  "ERC20: transfer amount exceeds allowance": "This subscription has reached its spending limit.",
  relay_fee_too_low: "Network fees went up just now. Refresh the page and try again.",
  "ERC20: transfer amount exceeds balance": "There isn't enough USDT for this.",
  payment_in_progress: "This payment is already being sent.",
  open_invoice_limit: "You have 5 unpaid invoices. Get one paid before creating more.",
  daily_limit_reached: "You've reached today's limit for this action.",
  too_many_requests: "Too many requests. Wait a minute and try again.",
  log_in_again: "Your session ended. Log in again.",
  network: "We couldn't reach Settle. Check your connection.",
};

const UNAVAILABLE = new Set([
  "relayer_not_configured",
  "relayer_low_balance",
  "relayer_budget_spent",
  "gas_price_too_high",
]);

export function relayErrorMessage(code: string) {
  if (UNAVAILABLE.has(code)) return "Settle can't send transactions right now. Try again later.";
  return MESSAGES[code] ?? "That didn't go through. Nothing changed.";
}
