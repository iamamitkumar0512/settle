import { parseAbi } from "viem";

// Where Settle is deployed: Whitechain Sepolia.
export const DEFAULTS = {
  baseUrl: "https://settle-usdt.vercel.app",
  chainId: 1874,
  rpcUrl: "https://rpc.testnet.whitechain.io",
  registryAddress: "0x4c6F09e112CaF53f2922b382DafD8Aa95826628F",
  transferAddress: "0x947a28093aD9Eb1fC5B747383e947CDAc03c0700",
  usdtAddress: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
} as const;

export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

export const USDT_DECIMALS = 6;

export const registryAbi = parseAbi([
  "function nextId() view returns (uint256)",
  "function invoices(uint256 id) view returns (address merchant, address payer, uint256 amount, uint256 refunded, uint64 dueAt, uint64 paidAt, uint8 status, bytes32 ref, uint256 relayFee)",
  "event InvoicePaid(uint256 indexed id, address indexed merchant, address indexed payer, uint256 amount, uint256 relayFee, bool gasless)",
]);

export const usdtAbi = parseAbi(["function balanceOf(address account) view returns (uint256)"]);
