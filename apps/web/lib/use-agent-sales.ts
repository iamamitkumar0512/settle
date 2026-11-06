"use client";

import { useQuery } from "@tanstack/react-query";
import type { AgentSale } from "./agent-sale";
import { postJson } from "./relay-client";
import { useSession } from "./use-session";

const NO_SALES: AgentSale[] = [];

// What AI agents have bought from the logged-in merchant, newest first.
export function useAgentSales() {
  const { address, credentials } = useSession();

  const sales = useQuery({
    queryKey: ["agent-sales", address, credentials],
    enabled: Boolean(address && credentials),
    refetchInterval: 15_000,
    queryFn: async () => {
      const result = await postJson("/api/merchant/agent-sales", { credentials });
      if (!result.ok) throw new Error(result.error);
      return result.data.sales as AgentSale[];
    },
  });

  return sales.data ?? NO_SALES;
}
