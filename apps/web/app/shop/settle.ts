import "server-only";
import { headers } from "next/headers";
import Settle from "settle-pay";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { REGISTRY_ADDRESS, TRANSFER_ADDRESS } from "@/lib/contracts";
import { SHOP_NAME } from "./products";

// The shop is a separate business that happens to be hosted next to Settle. It reaches Settle
// only through the SDK, the way any other shop's server would. Returns null until the shop has
// a wallet of its own.
export async function shopSettle() {
  const key = process.env.SHOP_MERCHANT_PK;
  if (!key) return null;

  const request = await headers();
  const protocol = request.get("x-forwarded-proto") ?? "http";
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  return new Settle({
    keyId: account.address,
    keySecret: key,
    businessName: SHOP_NAME,
    baseUrl: `${protocol}://${request.get("host")}`,
    // A shop elsewhere passes none of these. They keep the demo on the same contracts as the
    // app around it, including the test deployments.
    rpcUrl: process.env.RPC_ENDPOINT,
    registryAddress: REGISTRY_ADDRESS,
    transferAddress: TRANSFER_ADDRESS,
  });
}
