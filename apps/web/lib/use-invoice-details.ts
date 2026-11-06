"use client";

import { useQuery } from "@tanstack/react-query";

type PublicDetails = {
  merchantName: string;
  memo: string;
};

// The business name and memo from Arkiv. Null when the invoice has no saved details.
export function useInvoiceDetails(id: bigint | undefined) {
  return useQuery({
    queryKey: ["invoice-details", String(id)],
    enabled: id !== undefined,
    staleTime: Infinity,
    queryFn: async (): Promise<PublicDetails | null> => {
      const response = await fetch(`/api/invoices/${id}/details`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Couldn't load invoice details");
      return response.json();
    },
  });
}
