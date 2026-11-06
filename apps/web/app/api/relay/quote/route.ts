import { connection } from "next/server";
import { TRANSFER_ADDRESS } from "@/lib/contracts";
import {
  MIN_INVOICE,
  RELAY_FEE,
  RelayError,
  relayerAccount,
  WITHDRAW_FEE,
} from "@/lib/server/relayer";

// What the relayer charges: the fee stored on a new invoice, and the fee for sending USDT.
export async function GET() {
  // Read the relayer's settings per request, not once at build time.
  await connection();
  let relayer: string | null = null;
  try {
    relayer = relayerAccount().address;
  } catch (error) {
    if (!(error instanceof RelayError)) throw error;
  }
  return Response.json({
    available: relayer !== null,
    relayer,
    relayFee: String(RELAY_FEE),
    minInvoice: String(MIN_INVOICE),
    canWithdraw: relayer !== null && Boolean(TRANSFER_ADDRESS),
    withdrawFee: String(WITHDRAW_FEE),
  });
}
