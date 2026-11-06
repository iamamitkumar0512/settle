import "server-only";
import { parseUnits } from "viem";
import { whitechainSepolia } from "@/lib/chains";
import { chainClient } from "./relayer";

// Typical gas for each relayed call, measured in fork tests and on the live chain.
const PAY_GAS = 150_000n;
const WITHDRAW_GAS = 160_000n;
const CHARGE_GAS = 135_000n;
// Fees are rounded up to 0.001 USDT.
const STEP = 1_000n;
const PRICE_TTL_MS = 5 * 60_000;
const STATS_URL = `${whitechainSepolia.blockExplorers.default.url}/api/v2/stats`;

// Used only when the WBT price or the gas price can't be read.
const FALLBACK_PAY_FEE = parseUnits(process.env.RELAY_FEE_USDT ?? "0.05", 6);
const FALLBACK_WITHDRAW_FEE = parseUnits(process.env.WITHDRAW_FEE_USDT ?? "0.05", 6);

let lastPrice: { microUsdt: bigint; readAt: number } | undefined;

// WBT's price from the explorer, in millionths of a USDT per WBT.
async function wbtPrice() {
  if (lastPrice && Date.now() - lastPrice.readAt < PRICE_TTL_MS) return lastPrice.microUsdt;
  try {
    const response = await fetch(STATS_URL, { signal: AbortSignal.timeout(5_000) });
    const { coin_price: coinPrice } = (await response.json()) as { coin_price?: unknown };
    const price = Number(coinPrice);
    if (!response.ok || !Number.isFinite(price) || price <= 0) throw new Error("No WBT price");
    lastPrice = { microUsdt: BigInt(Math.round(price * 1e6)), readAt: Date.now() };
    return lastPrice.microUsdt;
  } catch {
    // An older price is closer to the truth than a fixed fee.
    return lastPrice?.microUsdt ?? null;
  }
}

function inUsdt(gas: bigint, gasPrice: bigint, price: bigint) {
  const microUsdt = (gas * gasPrice * price) / 10n ** 18n;
  return (microUsdt / STEP + 1n) * STEP;
}

// What a relayed payment, transfer and subscription charge cost the relayer in gas right now,
// in USDT.
// Settle adds no margin: a fee only repays the gas.
export async function relayFees() {
  const [price, gasPrice] = await Promise.all([
    wbtPrice(),
    chainClient.getGasPrice().catch(() => null),
  ]);
  if (price === null || gasPrice === null) {
    return {
      payFee: FALLBACK_PAY_FEE,
      withdrawFee: FALLBACK_WITHDRAW_FEE,
      chargeFee: FALLBACK_PAY_FEE,
    };
  }
  return {
    payFee: inUsdt(PAY_GAS, gasPrice, price),
    withdrawFee: inUsdt(WITHDRAW_GAS, gasPrice, price),
    // What collecting one period of a subscription costs. A plan stores it as its fee.
    chargeFee: inUsdt(CHARGE_GAS, gasPrice, price),
  };
}

// A fee quoted a minute ago can sit just under the estimate when it is used.
export function coversNewRequest(fee: bigint, estimate: bigint) {
  return fee * 10n >= estimate * 9n;
}

// An invoice keeps the fee it was created with, so its payment is still sent after gas has
// risen, up to twice that fee.
export function coversOpenInvoice(fee: bigint, estimate: bigint) {
  return fee * 2n >= estimate;
}
