import type { Address } from "viem";
import { invoiceRegistryAbi } from "./abi/invoiceRegistry";
import { whitechainSepolia } from "./chains";

// The override points the app at a separate deployment for testing.
export const REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ??
  "0x7ac2BbccfF3156ee4f36E41b5091e2b7E02E21bA") as Address;
export const USDT_ADDRESS: Address =
  "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";

// Event scans start here; nothing older can belong to this deployment.
export const REGISTRY_DEPLOY_BLOCK = 12320318n;

export const USDT_DECIMALS = 6;

export const registry = {
  address: REGISTRY_ADDRESS,
  abi: invoiceRegistryAbi,
  chainId: whitechainSepolia.id,
} as const;

export { invoiceRegistryAbi };
export { usdtAbi } from "./abi/usdt";
