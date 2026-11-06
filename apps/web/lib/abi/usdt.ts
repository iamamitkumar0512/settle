import { parseAbi } from "viem";

// The USDT functions the app calls directly.
export const usdtAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function nonces(address owner) view returns (uint256)",
]);
