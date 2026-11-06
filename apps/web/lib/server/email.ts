import "server-only";

// The override points at a stand-in for tests.
const API_URL = (process.env.RESEND_API_URL ?? "https://api.resend.com").replace(/\/+$/, "");
// Resend's own sender needs no domain, but it only delivers to the Resend account's own address.
const FROM = process.env.REMINDER_FROM ?? "Settle <onboarding@resend.dev>";
const TIMEOUT_MS = 15_000;

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(message: { to: string; subject: string; text: string; html: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Email is not configured");

  const response = await fetch(`${API_URL}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, ...message, to: [message.to] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Email was refused with status ${response.status}`);
}
