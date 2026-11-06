import { formatUnits, type Address, type Hash } from "viem";
import { whitechainSepolia } from "./chains";
import { USDT_DECIMALS } from "./contracts";

export function shortAddress(address: Address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortHash(hash: Hash) {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export function formatUsdt(amount: bigint) {
  const [whole, fraction = ""] = formatUnits(amount, USDT_DECIMALS).split(".");
  return `${BigInt(whole).toLocaleString("en-US")}.${fraction.padEnd(2, "0")}`;
}

const PERIOD_UNITS: [number, string][] = [
  [31_536_000, "year"],
  [2_592_000, "month"],
  [604_800, "week"],
  [86_400, "day"],
  [3_600, "hour"],
  [60, "minute"],
];

// "every month", or "every 3 days" when the period isn't one plain unit. A month is 30 days.
export function periodLabel(seconds: number) {
  for (const [size, unit] of PERIOD_UNITS) {
    if (seconds % size === 0) {
      const count = seconds / size;
      return count === 1 ? `every ${unit}` : `every ${count} ${unit}s`;
    }
  }
  return `every ${seconds} seconds`;
}

export function explorerTxUrl(hash: Hash) {
  return `${whitechainSepolia.blockExplorers.default.url}/tx/${hash}`;
}

export function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: Date) {
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
