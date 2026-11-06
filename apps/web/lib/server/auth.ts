import "server-only";
import { isHex, verifyMessage } from "viem";
import { parseSignInMessage, SESSION_HOURS } from "@/lib/wallet-session";
import { verifiedAccount, type VerifiedAccount } from "./privy-identity";

// Proves who is calling. Email users send a Privy identity token; wallet users send the sign-in
// message they signed. Either way the result is the emails and wallets they have proven.
export async function authenticate(
  credentials: unknown,
  host: string | null,
): Promise<VerifiedAccount | null> {
  if (typeof credentials !== "object" || credentials === null) return null;
  const { identityToken, message, signature } = credentials as Record<string, unknown>;

  if (typeof identityToken === "string") return verifiedAccount(identityToken);
  if (typeof message !== "string" || typeof signature !== "string" || !isHex(signature)) {
    return null;
  }

  const session = parseSignInMessage(message);
  const now = Date.now();
  if (
    !session ||
    session.site !== host ||
    !(session.expiresAt > now) ||
    session.expiresAt > now + (SESSION_HOURS + 1) * 3_600_000
  ) {
    return null;
  }

  const valid = await verifyMessage({ address: session.wallet, message, signature }).catch(
    () => false,
  );
  return valid ? { emails: [], wallets: [session.wallet] } : null;
}
