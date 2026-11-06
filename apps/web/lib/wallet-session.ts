import { getAddress, isAddress, type Address } from "viem";

export const SESSION_HOURS = 24;

// What a wallet user signs once to prove the wallet is theirs. It costs no gas.
export function signInMessage(wallet: Address, site: string, expiresAt: string) {
  return ["Sign in to Settle.", "", `Wallet: ${wallet}`, `Site: ${site}`, `Expires: ${expiresAt}`].join(
    "\n",
  );
}

export function parseSignInMessage(message: string) {
  const match = message.match(/^Wallet: (.+)\nSite: (.+)\nExpires: (.+)$/m);
  if (!match || !isAddress(match[1])) return null;
  const wallet = getAddress(match[1]);
  const [site, expiresAt] = [match[2], match[3]];
  if (message !== signInMessage(wallet, site, expiresAt)) return null;
  return { wallet, site, expiresAt: Date.parse(expiresAt) };
}
