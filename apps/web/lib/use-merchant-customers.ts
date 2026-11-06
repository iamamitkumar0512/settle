"use client";

import { useQuery } from "@tanstack/react-query";
import type { InvoiceCustomer } from "./customer-invoices";
import { postJson } from "./relay-client";
import { useSession } from "./use-session";

const NO_CUSTOMERS = new Map<string, InvoiceCustomer>();

// The logged-in merchant's saved invoice details, decrypted by the server for them only.
export function useMerchantCustomers() {
  const { address, credentials } = useSession();

  const customers = useQuery({
    queryKey: ["merchant-customers", address, credentials],
    enabled: Boolean(address && credentials),
    refetchInterval: 30_000,
    queryFn: async () => {
      const result = await postJson("/api/merchant/customers", { credentials });
      if (!result.ok) throw new Error(result.error);
      const list = result.data.customers as InvoiceCustomer[];
      return new Map(list.map((customer) => [customer.id, customer]));
    },
  });

  return {
    customers: customers.data ?? NO_CUSTOMERS,
    isUnlocked: Boolean(credentials),
    error: customers.isError ? "Couldn't load customer details." : undefined,
  };
}
