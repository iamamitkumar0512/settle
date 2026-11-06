import { usdtAbi, USDT_ADDRESS } from "@/lib/contracts";
import { authenticate } from "@/lib/server/auth";
import { allow, DAY } from "@/lib/server/rate-limit";
import { addressField, relayRoute, uintField } from "@/lib/server/relay-http";
import { chainClient, relay, RelayError } from "@/lib/server/relayer";
import { topUpLimit } from "@/lib/server/topup";

export const maxDuration = 60;

const TOPUPS_PER_DAY = 40;

// When each wallet last got one. Kept in memory, like the rate limits.
const lastTopUp = new Map<string, number>();

// Gives a logged-in account a little test USDT, once a day. A live version would take a card or
// a bank payment here. Testnet only, and off unless DEMO_TOPUP_USDT is set.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const limit = topUpLimit();
    if (limit === 0n) throw new RelayError(503, "topup_off");

    const account = await authenticate(body.credentials, request.headers.get("host"));
    if (!account) throw new RelayError(401, "log_in_again");
    const wallet = addressField(body.wallet);
    const isTheirs = account.wallets.some(
      (candidate) => candidate.toLowerCase() === wallet.toLowerCase(),
    );
    if (!isTheirs) throw new RelayError(403, "not_your_account");

    const key = wallet.toLowerCase();
    if (Date.now() - (lastTopUp.get(key) ?? 0) < DAY) throw new RelayError(429, "topup_used");

    // Test money is for an account that has none. This also stops one account collecting it
    // over and over, whatever happens to the counters above.
    const balance = await chainClient.readContract({
      address: USDT_ADDRESS,
      abi: usdtAbi,
      functionName: "balanceOf",
      args: [wallet],
    });
    if (balance >= limit) throw new RelayError(409, "topup_not_needed");

    const wanted = uintField(body.amount);
    const amount = wanted > 0n && wanted < limit ? wanted : limit;
    if (!allow("topups", TOPUPS_PER_DAY, DAY)) throw new RelayError(503, "topup_spent");

    const { hash } = await relay({
      address: USDT_ADDRESS,
      abi: usdtAbi,
      functionName: "transfer",
      args: [wallet, amount],
    }).catch((error: unknown) => {
      // The relayer's USDT ran out. The money isn't anyone's, so it just says so.
      if (error instanceof RelayError) throw new RelayError(503, "topup_empty");
      throw error;
    });
    lastTopUp.set(key, Date.now());
    return { txHash: hash, amount: String(amount) };
  });
}
