import type { Address } from "viem";

export const REGISTRY_ADDRESS: Address =
  "0x7ac2BbccfF3156ee4f36E41b5091e2b7E02E21bA";
export const USDT_ADDRESS: Address =
  "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";

// Event scans start here; nothing older can belong to this deployment.
export const REGISTRY_DEPLOY_BLOCK = 12320318n;

export const USDT_DECIMALS = 6;

export { invoiceRegistryAbi } from "./abi/invoiceRegistry";
export { usdtAbi } from "./abi/usdt";
