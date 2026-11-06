"use client";

import { useQuery } from "@tanstack/react-query";
import type { PlanDetails } from "./subscription";

// Every plan's saved name and description from Arkiv. Returns a lookup by plan id, which gives
// nothing for a plan whose details weren't saved.
export function usePlanDetails() {
  const { data } = useQuery({
    queryKey: ["plan-details"],
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch("/api/plans");
      if (!response.ok) throw new Error("Couldn't load plan details");
      return (await response.json()).plans as Record<string, PlanDetails>;
    },
  });
  return (id: bigint) => data?.[String(id)];
}
