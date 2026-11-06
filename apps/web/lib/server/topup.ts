import "server-only";
import { parseUnits } from "viem";
import { USDT_DECIMALS } from "@/lib/contracts";

// How much test USDT a new account may be given, so it can try paying with nothing set up. It
// comes from the relayer's own USDT. Off unless set.
export function topUpLimit() {
  return parseUnits(process.env.DEMO_TOPUP_USDT ?? "0", USDT_DECIMALS);
}
