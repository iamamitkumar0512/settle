"use client";

import { useParams } from "next/navigation";
import { zeroAddress } from "viem";
import { useReadContract } from "wagmi";
import { registry } from "./contracts";
import { toInvoice } from "./invoice";

const REFRESH_MS = 15_000;

function parseInvoiceId(value: unknown) {
  return typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) ? BigInt(value) : null;
}

export function useInvoice() {
  const params = useParams();
  const id = parseInvoiceId(params.id);

  const read = useReadContract({
    ...registry,
    functionName: "invoices",
    args: [id ?? 0n],
    query: { enabled: id !== null, refetchInterval: REFRESH_MS },
  });

  const invoice = id !== null && read.data ? toInvoice(id, read.data) : undefined;

  let state: "loading" | "ready" | "notFound" | "error" = "loading";
  if (id === null || invoice?.merchant === zeroAddress) state = "notFound";
  else if (invoice) state = "ready";
  else if (read.isError) state = "error";

  return { id, invoice, state, refetch: read.refetch };
}
