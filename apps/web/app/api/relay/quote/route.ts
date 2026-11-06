import { connection } from "next/server";
import {
  MIN_INVOICE,
  RELAY_FEE,
  RelayError,
  relayerAccount,
  WITHDRAW_FEE,
} from "@/lib/server/relayer";
import { swarmConfigured } from "@/lib/server/swarm";

// What the server can do right now, and what the relayer charges: the fee stored on a new
// invoice, and the fee for sending USDT.
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
    withdrawFee: String(WITHDRAW_FEE),
    canAttachPdf: swarmConfigured(),
  });
}
