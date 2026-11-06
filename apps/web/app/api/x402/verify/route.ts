import { checkFunds, checkPayment } from "@/lib/server/agent-sales";
import { relayRoute } from "@/lib/server/relay-http";
import { RelayError } from "@/lib/server/relayer";

export const maxDuration = 60;

// x402's verify step. It reads the chain and moves nothing.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    let payer: string | undefined;
    try {
      const payment = await checkPayment(body);
      payer = payment.authorization.from;
      await checkFunds(payment);
      return { isValid: true, payer };
    } catch (error) {
      if (error instanceof RelayError && error.status === 400) {
        return { isValid: false, invalidReason: error.code, payer };
      }
      throw error;
    }
  });
}
