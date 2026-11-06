"use client";

import {
  useCreateWallet,
  useIdentityToken,
  usePrivy,
  useSignTypedData as usePrivySignTypedData,
  useWallets,
} from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useConnection, useDisconnect, useSignMessage, useSignTypedData } from "wagmi";
import { whitechainSepolia } from "./chains";
import { shortAddress } from "./format";
import { SESSION_HOURS, signInMessage } from "./wallet-session";

export type Credentials = { identityToken: string } | { message: string; signature: Hex };

export type SignableTypedData = {
  domain: Record<string, unknown>;
  types: Record<string, readonly { readonly name: string; readonly type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

type StoredSession = { message: string; signature: Hex; expiresAt: number };

function storageKey(address: Address) {
  return `settle.session.${address.toLowerCase()}`;
}

function readSession(address: Address): StoredSession | null {
  try {
    const saved = window.sessionStorage.getItem(storageKey(address));
    const session = saved ? (JSON.parse(saved) as StoredSession) : null;
    return session && session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function writeSession(address: Address, session: StoredSession | null) {
  try {
    if (session) window.sessionStorage.setItem(storageKey(address), JSON.stringify(session));
    else window.sessionStorage.removeItem(storageKey(address));
  } catch {
    // Without storage the sign-in still works until the page is reloaded.
  }
}

// Privy takes typed data as JSON, so numbers travel as strings.
function jsonSafe(typed: SignableTypedData) {
  return {
    domain: typed.domain,
    types: Object.fromEntries(Object.entries(typed.types).map(([name, fields]) => [name, [...fields]])),
    primaryType: typed.primaryType,
    message: Object.fromEntries(
      Object.entries(typed.message).map(([key, value]) => [
        key,
        typeof value === "bigint" ? String(value) : value,
      ]),
    ),
  };
}

// One account for the whole app. A user logs in by email (Privy creates their wallet and signs
// silently) or with a browser wallet (they sign in their wallet). Either way nothing costs gas.
export function useSession() {
  const privy = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { identityToken } = useIdentityToken();
  const { signTypedData: signWithPrivy } = usePrivySignTypedData();
  const connection = useConnection();
  const { mutateAsync: signWithWallet } = useSignTypedData();
  const { mutateAsync: signMessage } = useSignMessage();
  const { mutate: disconnect } = useDisconnect();
  const queryClient = useQueryClient();

  const isEmail = privy.ready && privy.authenticated;
  const embedded = wallets.find((wallet) => wallet.walletClientType === "privy")?.address as
    | Address
    | undefined;
  const connected = connection.status === "connected" ? connection.address : undefined;
  const address = isEmail ? embedded : connected;
  const email = isEmail ? privy.user?.email?.address : undefined;

  const stored = useQuery({
    queryKey: ["wallet-session", connected],
    enabled: !isEmail && Boolean(connected),
    staleTime: Infinity,
    queryFn: () => readSession(connected as Address),
  });

  // Privy creates the wallet when someone logs in. A login that was restored from before that
  // setting was on has none, and would otherwise wait forever.
  const hasPrivyWallet = privy.user?.linkedAccounts.some(
    (account) => account.type === "wallet" && account.walletClientType === "privy",
  );

  let status: "loading" | "signedOut" | "needsWallet" | "ready";
  if (!privy.ready || connection.status === "reconnecting") status = "loading";
  else if (isEmail && embedded) status = "ready";
  else if (isEmail) status = walletsReady && !hasPrivyWallet ? "needsWallet" : "loading";
  else status = connected ? "ready" : "signedOut";

  let credentials: Credentials | null = null;
  if (isEmail) credentials = identityToken ? { identityToken } : null;
  else if (stored.data) {
    credentials = { message: stored.data.message, signature: stored.data.signature };
  }

  async function signTypedData(typed: SignableTypedData): Promise<Hex> {
    if (!address) throw new Error("Not logged in");
    if (isEmail) {
      const { signature } = await signWithPrivy(jsonSafe(typed), {
        address,
        uiOptions: { showWalletUIs: false },
      });
      return signature as Hex;
    }
    return signWithWallet({ ...typed, account: address } as Parameters<typeof signWithWallet>[0]);
  }

  // Wallet users sign one message to unlock their private data. Email users never need this.
  async function signIn(wallet: Address | undefined = connected) {
    if (!wallet) return;
    const expiresAt = Date.now() + SESSION_HOURS * 3_600_000;
    const message = signInMessage(wallet, window.location.host, new Date(expiresAt).toISOString());
    const signature = await signMessage({ message, account: wallet });
    const session = { message, signature, expiresAt };
    writeSession(wallet, session);
    queryClient.setQueryData(["wallet-session", wallet], session);
  }

  function logout() {
    if (isEmail) {
      void privy.logout();
      return;
    }
    if (connected) {
      writeSession(connected, null);
      queryClient.setQueryData(["wallet-session", connected], null);
    }
    disconnect({});
  }

  return {
    status,
    kind: isEmail ? ("email" as const) : ("wallet" as const),
    address,
    email,
    label: email ?? (address ? shortAddress(address) : ""),
    isOnWhitechain: isEmail || connection.chainId === whitechainSepolia.id,
    credentials,
    signTypedData,
    signIn,
    createWallet: () => createWallet(),
    logout,
  };
}
