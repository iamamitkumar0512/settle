import "server-only";

// Scheduled routes are open unless CRON_SECRET is set. With it, the caller must send it as a
// bearer token, which is what Vercel Cron does.
export function isAuthorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  return !secret || request.headers.get("authorization") === `Bearer ${secret}`;
}
