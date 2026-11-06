"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address, Hex } from "viem";
import { useConnection, useSignMessage } from "wagmi";
import { SESSION_HOURS, signInMessage, type InvoiceCustomer } from "./merchant-session";
import { isUserRejection } from "./wallet-errors";

type Session = { message: string; signature: Hex; expiresAt: number };

function storageKey(address: Address) {
  return `settle.merchant-session.${address.toLowerCase()}`;
}

function readSession(address: Address): Session | null {
  try {
    const saved = window.sessionStorage.getItem(storageKey(address));
    const session = saved ? (JSON.parse(saved) as Session) : null;
    return session && session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function writeSession(address: Address, session: Session) {
  try {
    window.sessionStorage.setItem(storageKey(address), JSON.stringify(session));
  } catch {
    // Without storage the sign-in still works until the page is reloaded.
  }
}

const NO_CUSTOMERS = new Map<string, InvoiceCustomer>();

// Unlocks a merchant's decrypted customer details with one wallet signature.
export function useMerchantDetails() {
  const { address } = useConnection();
  const queryClient = useQueryClient();
  const { signMessageAsync } = useSignMessage();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string>();

  const session = useQuery({
    queryKey: ["merchant-session", address],
    enabled: Boolean(address),
    staleTime: Infinity,
    queryFn: () => readSession(address as Address),
  });

  const customers = useQuery({
    queryKey: ["merchant-customers", address, session.data?.signature],
    enabled: Boolean(session.data),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { message, signature } = session.data as Session;
      const response = await fetch("/api/merchant/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!response.ok) throw new Error("Couldn't load customer details");
      const body = (await response.json()) as { customers: InvoiceCustomer[] };
      return new Map(body.customers.map((customer) => [customer.id, customer]));
    },
  });

  async function signIn() {
    if (!address) return;
    setIsSigningIn(true);
    setSignInError(undefined);
    try {
      const expiresAt = Date.now() + SESSION_HOURS * 3_600_000;
      const message = signInMessage(
        address,
        window.location.host,
        new Date(expiresAt).toISOString(),
      );
      const signature = await signMessageAsync({ message });
      const signedIn = { message, signature, expiresAt };
      writeSession(address, signedIn);
      queryClient.setQueryData(["merchant-session", address], signedIn);
    } catch (error) {
      setSignInError(
        isUserRejection(error) ? "Sign-in cancelled." : "Couldn't sign in. Try again.",
      );
    }
    setIsSigningIn(false);
  }

  return {
    isSignedIn: Boolean(session.data),
    isSigningIn,
    signIn,
    customers: customers.data ?? NO_CUSTOMERS,
    error: signInError ?? (customers.isError ? "Couldn't load customer details." : undefined),
  };
}
