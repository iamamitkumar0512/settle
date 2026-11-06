import "server-only";
import nodemailer from "nodemailer";

type EmailMessage = { to: string; subject: string; text: string; html: string };

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
    : `Email not sent: the mail service answered ${error.status} (${error.reason}).`;
}

// A mailbox to send from, such as Gmail with an app password. It needs no domain of your own and
// reaches any address, so it's used instead of Resend when it's set.
function smtpLogin() {
  const user = process.env.SMTP_USER?.trim();
  // Google shows app passwords with spaces in them.
  const pass = process.env.SMTP_PASS?.replaceAll(" ", "");
  return user && pass ? { user, pass } : null;
}

export function emailConfigured() {
  return Boolean(smtpLogin() || process.env.RESEND_API_KEY);
}

async function sendBySmtp(auth: { user: string; pass: string }, message: EmailMessage) {
  // The overrides point at a stand-in for tests.
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: port === 465,
    auth,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });

  try {
    await transport.sendMail({
      from: process.env.REMINDER_FROM ?? `Settle <${auth.user}>`,
      ...message,
      // As an object it's one recipient. As text, a comma in it would split it into two.
      to: { name: "", address: message.to },
    });
  } catch (error) {
    // Its code only: the message can hold an email address.
    const { code, responseCode } = error as { code?: string; responseCode?: number };
    throw new EmailError("refused", responseCode ?? 0, code ?? "unknown");
  }
}

export async function sendEmail(message: EmailMessage) {
  const smtp = smtpLogin();
  if (smtp) return sendBySmtp(smtp, message);

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
