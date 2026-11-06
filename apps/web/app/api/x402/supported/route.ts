import { connection } from "next/server";
import { USDT_ADDRESS } from "@/lib/contracts";
import { X402_NETWORK } from "@/lib/server/agent-sales";
import { RelayError, relayerAccount } from "@/lib/server/relayer";

// What this facilitator settles: x402's `exact` scheme, in USDT on Whitechain.
export async function GET() {
  await connection();
  try {
    return Response.json({
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: X402_NETWORK,
          extra: { asset: USDT_ADDRESS, name: "Tether USD", version: "1" },
        },
      ],
      extensions: [],
      signers: { "eip155:*": [relayerAccount().address] },
    });
  } catch (error) {
    if (error instanceof RelayError) return Response.json({ error: error.code }, { status: 503 });
    throw error;
  }
}
