import "server-only";

const windows = new Map<string, { count: number; resetAt: number }>();

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// Counts are kept in memory, so they reset on restart and aren't shared between server instances.
export function allow(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}
