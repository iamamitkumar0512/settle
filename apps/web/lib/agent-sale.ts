import { encodeAbiParameters, keccak256, type Address, type Hash, type Hex } from "viem";

// The token's standard authorization, the one every x402 client signs.
export const TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export type AgentSaleDetails = {
  merchantName: string;
  receipt: string;
  description: string;
};

// The nonce of the merchant's gas repayment. It commits to the agent's payment and to what was
// sold, so the merchant's one signature covers all of it and nobody else can write a sale.
// The SDK computes the same value.
export function agentSaleNonce(paymentNonce: Hex, details: AgentSaleDetails): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "bytes32" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
      ],
      [
        "SETTLE_AGENT_SALE",
        paymentNonce,
        details.merchantName,
        details.receipt,
        details.description,
      ],
    ),
  );
}

// A sale that went through. Amounts are text, in base units, because it arrives as JSON.
export type AgentSale = {
  receipt: string;
  description: string;
  merchantName: string;
  payer: Address;
  amount: string;
  networkFee: string;
  received: string;
  soldAt: string;
  transaction: Hash;
};
