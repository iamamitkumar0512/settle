"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { registry } from "./contracts";
import { logsClient } from "./logs-client";
import { blockWindows } from "./use-invoice-records";

// How an invoice was paid. The fee repaid the relayer's gas for sending the payment; it is 0 when
// the customer paid with their own gas.
export type MerchantPayment = { fee: bigint; gasless: boolean };

const NO_PAYMENTS = new Map<string, MerchantPayment>();

// Only a payment's event says what fee it carried, so this reads the merchant's payment events.
// It reloads when the number of paid invoices changes.
export function useMerchantPayments(merchant: Address | undefined, paidCount: number) {
  const payments = useQuery({
    queryKey: ["merchant-payments", merchant, paidCount],
    enabled: Boolean(merchant) && paidCount > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const latest = await logsClient.getBlockNumber();
      const byInvoice = new Map<string, MerchantPayment>();
      for (const blocks of blockWindows(latest)) {
        const logs = await logsClient.getContractEvents({
          address: registry.address,
          abi: registry.abi,
          eventName: "InvoicePaid",
          args: { merchant },
          ...blocks,
        });
        for (const log of logs) {
          byInvoice.set(String(log.args.id), {
            fee: log.args.relayFee ?? 0n,
            gasless: log.args.gasless ?? false,
          });
        }
      }
      return byInvoice;
    },
  });

  // Undefined while loading, so the page can tell "no fee" from "not known yet".
  return paidCount === 0 ? NO_PAYMENTS : payments.data;
}
