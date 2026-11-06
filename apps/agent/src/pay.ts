// The standard x402 client, with nothing Settle-specific in it. All this adds is the agent's
// limits, and a retry that can never pay twice.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ExactEvmScheme } from "@x402/evm";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { createPublicClient, formatEther, formatUnits, http, parseAbi, parseUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
export const NETWORK = "eip155:1874";
const RETRIES = 4;
const WAIT_MS = 5_000;

const settings = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(settings)) process.loadEnvFile(settings);

export function setting(name: string) {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name} in apps/agent/.env. See .env.example.`);
    process.exit(1);
  }
  return value;
}

export const account = () => privateKeyToAccount(setting("AGENT_KEY") as Hex);
export const storeUrl = () => setting("STORE_URL").replace(/\/+$/, "");

const chain = createPublicClient({
  transport: http(process.env.AGENT_RPC_URL ?? "https://rpc.testnet.whitechain.io"),
});

export async function balances() {
  const { address } = account();
  const [usdt, wbt] = await Promise.all([
    chain.readContract({
      address: USDT,
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      args: [address],
    }),
    chain.getBalance({ address }),
  ]);
  return { address, usdt, wbt, usdtText: formatUnits(usdt, 6), wbtText: formatEther(wbt) };
}

type Log = (status: number) => void;

// A fetch that pays. A price above the cap, or from anyone but this store, is never signed.
export function payingFetch(log?: Log, maxPerPayment = process.env.MAX_PER_PAYMENT ?? "5.00") {
  const store = setting("STORE_ADDRESS").toLowerCase();
  const watched: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    log?.(response.status);
    return response;
  };
  return wrapFetchWithPaymentFromConfig(watched, {
    schemes: [{ network: NETWORK, client: new ExactEvmScheme(account()) }],
    spendControls: {
      allowedAssets: [
        {
          network: NETWORK,
          asset: USDT,
          maxAmountPerPayment: String(parseUnits(maxPerPayment, 6)),
        },
      ],
    },
    policies: [
      (_version, offers) => offers.filter((offer) => offer.payTo.toLowerCase() === store),
    ],
  });
}

export type Purchase = {
  ok: boolean;
  status: number;
  order?: string;
  proof?: string;
  error?: string;
  attempts: number;
};

// Sends one order, and repeats it with the same id if the answer is lost or the store says to wait.
// The id is what stops a repeat paying twice.
export async function buy(
  product: string,
  quantity: number,
  options: { requestId?: string; log?: Log; pay?: typeof fetch } = {},
): Promise<Purchase> {
  const requestId = options.requestId ?? randomUUID();
  const pay = options.pay ?? payingFetch(options.log);
  const body = JSON.stringify({ product, quantity, requestId });

  for (let attempts = 1; ; attempts += 1) {
    let status = 0;
    let answer: { order?: string; proof?: string; error?: string } = {};
    try {
      const response = await pay(`${storeUrl()}/api/agent/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      status = response.status;
      answer = await response.json().catch(() => ({}));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed";
      // Refused on this machine, before anything was signed.
      if (message.includes("spendControls") || message.includes("Failed to create payment")) {
        return { ok: false, status: 0, error: "over_the_agent_limit", attempts };
      }
      answer = { error: "no_answer" };
    }

    if (status === 200) return { ok: true, status, ...answer, attempts };
    const shouldRepeat = status === 0 || status === 503 || answer.error === "payment_in_progress";
    if (!shouldRepeat || attempts >= RETRIES) return { ok: false, status, ...answer, attempts };
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
  }
}
