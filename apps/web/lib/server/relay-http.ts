import "server-only";
import { isAddress, isHex, type Address, type Hex } from "viem";
import { allow, MINUTE } from "./rate-limit";
import { RelayError } from "./relayer";

const REQUESTS_PER_MINUTE = 30;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// The app's public address, for links in emails. APP_URL wins when set; otherwise it is the
// address this request came to.
export function requestOrigin(request: Request) {
  const fixed = process.env.APP_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${request.headers.get("host")}`;
}

type Body = Record<string, unknown>;

// Shared wrapper for relay routes: rate limit, parse JSON, and turn RelayError into a response.
export async function relayRoute(request: Request, handler: (body: Body) => Promise<object>) {
  if (!allow(`ip:${clientIp(request)}`, REQUESTS_PER_MINUTE, MINUTE)) {
    return fail(429, "too_many_requests");
  }

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) return fail(400, "invalid_request");

  try {
    return Response.json(await handler(body as Body));
  } catch (error) {
    if (error instanceof RelayError) return fail(error.status, error.code);
    // The name only: messages can contain a keyed RPC URL.
    console.error("Relay failed:", error instanceof Error ? error.name : "unknown");
    return fail(502, "relay_failed");
  }
}

function invalid(): never {
  throw new RelayError(400, "invalid_request");
}

export function uintField(value: unknown) {
  return typeof value === "string" && /^\d{1,78}$/.test(value) ? BigInt(value) : invalid();
}

// Solidity's uint32. It is small enough to travel as a JSON number, and the ABI takes one.
export function uint32Field(value: unknown) {
  const number = typeof value === "number" ? value : Number(uintField(value));
  return Number.isInteger(number) && number >= 0 && number <= 0xffffffff ? number : invalid();
}

export function addressField(value: unknown): Address {
  return typeof value === "string" && isAddress(value) ? value : invalid();
}

export function bytes32Field(value: unknown): Hex {
  return typeof value === "string" && isHex(value) && value.length === 66 ? value : invalid();
}

export function signatureField(value: unknown): Hex {
  return typeof value === "string" && isHex(value) && value.length === 132 ? value : invalid();
}

export function vrsFields(body: Body) {
  const v = body.v;
  if (v !== 27 && v !== 28) invalid();
  return { v: v as number, r: bytes32Field(body.r), s: bytes32Field(body.s) };
}

// A signature must still have a minute left, and can't be valid for more than an hour.
export function checkWindow(validBefore: bigint) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (validBefore < now + 60n || validBefore > now + 3600n) {
    throw new RelayError(400, "invalid_window");
  }
}
