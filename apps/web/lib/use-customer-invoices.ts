"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { registry } from "./contracts";
import type { CustomerInvoice } from "./customer-invoices";
import { invoiceState, toInvoice } from "./invoice";
import { postJson } from "./relay-client";
import { useNow } from "./use-now";
import { useSession } from "./use-session";

const REFRESH_MS = 60_000;

export function useInvoicesById(ids: bigint[], refetchInterval?: number) {
  const reads = useReadContracts({
    contracts: ids.map(
      (id) => ({ ...registry, functionName: "invoices", args: [id] }) as const,
    ),
    allowFailure: false,
    query: { enabled: ids.length > 0, refetchInterval },
  });
  return {
    invoices: (reads.data ?? []).map((row, index) => toInvoice(ids[index], row)),
    isLoading: ids.length > 0 && reads.isPending,
  };
}

// Invoices sent to this account's email or wallet address. They are private, so a wallet
// account sees them only after it has signed in.
export function useBilledInvoices() {
  const { address, credentials } = useSession();

  return useQuery({
    queryKey: ["customer-invoices", address, credentials],
    enabled: Boolean(credentials),
    // The nav, the reminder banner and the To pay page all read this, so one answer serves them.
    staleTime: REFRESH_MS / 2,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const result = await postJson("/api/customer/invoices", { credentials });
      if (!result.ok) throw new Error(result.error);
      return result.data.invoices as CustomerInvoice[];
    },
  });
}

// What this account still has to pay, most pressing first. "Urgent" means overdue or due within
// three days: those are the ones the app reminds about.
export function usePendingInvoices() {
  const billed = useBilledInvoices();
  const now = useNow(REFRESH_MS);
  const known = new Map((billed.data ?? []).map((invoice) => [invoice.id, invoice]));
  const { invoices } = useInvoicesById([...known.keys()].map(BigInt), REFRESH_MS);

  const open = invoices
    .map((invoice) => ({
      invoice,
      merchantName: known.get(String(invoice.id))?.merchantName,
      state: invoiceState(invoice, now, known.get(String(invoice.id))?.isOrder),
    }))
    .filter(({ state }) => state.group === "Open")
    .sort((a, b) => Number(a.invoice.dueAt - b.invoice.dueAt));

  return { open, urgent: open.filter(({ state }) => state.isOverdue || state.isDueSoon) };
}
