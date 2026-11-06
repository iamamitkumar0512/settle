import { connection } from "next/server";
import { relayFees } from "@/lib/server/gas-fee";
import { MIN_INVOICE, RelayError, relayerAccount } from "@/lib/server/relayer";
import { swarmConfigured } from "@/lib/server/swarm";

// What the server can do right now, and what a relayed payment and a relayed transfer cost in
// gas. A new invoice stores the first of those as its fee.
export async function GET() {
  // Read the relayer's settings per request, not once at build time.
  await connection();
  let relayer: string | null = null;
  try {
    relayer = relayerAccount().address;
  } catch (error) {
    if (!(error instanceof RelayError)) throw error;
  }
  const { payFee, withdrawFee, chargeFee } = await relayFees();
  return Response.json({
    available: relayer !== null,
    relayer,
    relayFee: String(payFee),
    minInvoice: String(MIN_INVOICE),
    withdrawFee: String(withdrawFee),
    chargeFee: String(chargeFee),
    canAttachPdf: swarmConfigured(),
  });
}
