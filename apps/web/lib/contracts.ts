import type { Address } from "viem";
import { gaslessTransferAbi } from "./abi/gaslessTransfer";
import { invoiceRegistryAbi } from "./abi/invoiceRegistry";
import { subscriptionsAbi } from "./abi/subscriptions";
import { whitechainSepolia } from "./chains";

// The override points the app at a separate deployment for testing.
export const REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ??
  "0x4c6F09e112CaF53f2922b382DafD8Aa95826628F") as Address;
export const USDT_ADDRESS: Address =
  "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
// GaslessTransfer, with the same kind of override for testing.
export const TRANSFER_ADDRESS = (process.env.NEXT_PUBLIC_TRANSFER_ADDRESS ||
  "0x947a28093aD9Eb1fC5B747383e947CDAc03c0700") as Address;

// Subscriptions, with the same kind of override for testing.
export const SUBSCRIPTIONS_ADDRESS = (process.env.NEXT_PUBLIC_SUBSCRIPTIONS_ADDRESS ||
  "0x9dcBde22A2aD70249f188d649236b788DDBd4C61") as Address;

// Event scans start here; nothing older can belong to this deployment.
export const REGISTRY_DEPLOY_BLOCK = 12333707n;

export const USDT_DECIMALS = 6;

export const registry = {
  address: REGISTRY_ADDRESS,
  abi: invoiceRegistryAbi,
  chainId: whitechainSepolia.id,
} as const;

export const subscriptions = {
  address: SUBSCRIPTIONS_ADDRESS,
  abi: subscriptionsAbi,
  chainId: whitechainSepolia.id,
} as const;

export { gaslessTransferAbi, invoiceRegistryAbi, subscriptionsAbi };
export { usdtAbi } from "./abi/usdt";
