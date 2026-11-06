import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { isAddress, type Address } from "viem";

function appId() {
  const id = process.env.PRIVY_APP_ID;
  if (!id) throw new Error("PRIVY_APP_ID is not configured");
  return id;
}

let keys: ReturnType<typeof createRemoteJWKSet> | undefined;

function verificationKeys() {
  keys ??= createRemoteJWKSet(
    new URL(`https://auth.privy.io/api/v1/apps/${appId()}/jwks.json`),
  );
  return keys;
}

export type VerifiedAccount = {
  emails: string[];
  wallets: Address[];
};

// Returns the emails and wallets Privy has verified for this login, or null if the token is bad.
export async function verifiedAccount(identityToken: string): Promise<VerifiedAccount | null> {
  try {
    const { payload } = await jwtVerify(identityToken, verificationKeys(), {
      issuer: "privy.io",
      audience: appId(),
    });
    const raw = payload.linked_accounts;
    const accounts: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(accounts)) return null;

    const account: VerifiedAccount = { emails: [], wallets: [] };
    for (const linked of accounts as { type?: unknown; address?: unknown }[]) {
      if (typeof linked.address !== "string") continue;
      if (linked.type === "email") account.emails.push(linked.address);
      if (linked.type === "wallet" && isAddress(linked.address)) {
        account.wallets.push(linked.address);
      }
    }
    return account;
  } catch {
    return null;
  }
}
