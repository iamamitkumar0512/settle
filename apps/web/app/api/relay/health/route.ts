import { formatEther } from "viem";
import { RelayError, relayerStatus } from "@/lib/server/relayer";

export async function GET() {
  try {
    const { address, balance, ok } = await relayerStatus();
    return Response.json({ relayer: address, balanceWbt: formatEther(balance), ok });
  } catch (error) {
    const code = error instanceof RelayError ? error.code : "unreachable";
    return Response.json({ ok: false, error: code }, { status: 503 });
  }
}
