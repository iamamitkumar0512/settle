import "server-only";

// The override points at a stand-in for tests.
const API_URL = (process.env.RESEND_API_URL ?? "https://api.resend.com").replace(/\/+$/, "");
// Resend's own sender needs no domain, but it only delivers to the Resend account's own address.
const FROM = process.env.REMINDER_FROM ?? "Settle <onboarding@resend.dev>";
const TIMEOUT_MS = 15_000;

// Why the provider refused an email. "test_sender" is Resend's rule for its shared sender and for
// a domain that isn't verified yet: such mail only reaches the Resend account's own address.
export type EmailFault = "test_sender" | "refused";

export class EmailError extends Error {
  constructor(
    readonly fault: EmailFault,
    readonly status: number,
    /** The provider's short error name. Never its message, which can hold an email address. */
    readonly reason: string,
  ) {
    super(`Email was refused with status ${status}`);
    this.name = "EmailError";
  }
}

// One line for the server log that says what to do about it.
export function describeEmailError(error: EmailError) {
  return error.fault === "test_sender"
    ? "Email not sent: Resend only delivers to its account's own address until a domain is verified there and REMINDER_FROM uses that domain."
    : `Email not sent: Resend answered ${error.status} (${error.reason}).`;
}

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
  if (response.ok) return;

  const answer = (await response.json().catch(() => null)) as {
    name?: unknown;
    message?: unknown;
  } | null;
  const detail = typeof answer?.message === "string" ? answer.message : "";
  const isTestSender =
    response.status === 403 && /testing emails|verify a domain|not verified/i.test(detail);
  throw new EmailError(
    isTestSender ? "test_sender" : "refused",
    response.status,
    typeof answer?.name === "string" ? answer.name : "unknown",
  );
}
