import { createPublicClient, http, type PublicClient } from "viem";
import { whitechainSepolia } from "./chains";

// Event history only. Ankr rejects long block ranges, while this RPC allows 10,000 blocks per call.
export const logsClient: PublicClient = createPublicClient({
  chain: whitechainSepolia,
  // The override is for pointing event reads at a local fork in tests.
  transport: http(process.env.NEXT_PUBLIC_LOGS_RPC_URL ?? "https://rpc.testnet.whitechain.io"),
});
