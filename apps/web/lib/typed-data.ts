import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { whitechainSepolia } from "./chains";
import {
  REGISTRY_ADDRESS,
  SUBSCRIPTIONS_ADDRESS,
  TRANSFER_ADDRESS,
  USDT_ADDRESS,
} from "./contracts";
import type { Invoice } from "./invoice";

// How long a signed request stays valid for the relayer to submit.
const VALID_SECONDS = 30 * 60;

const USDT_DOMAIN = {
  name: "Tether USD",
  version: "1",
  chainId: whitechainSepolia.id,
  verifyingContract: USDT_ADDRESS,
} as const;

const REGISTRY_DOMAIN = {
  name: "Settle InvoiceRegistry",
  version: "2",
  chainId: whitechainSepolia.id,
  verifyingContract: REGISTRY_ADDRESS,
} as const;

const AUTHORIZATION_FIELDS = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

const RECEIVE_TYPES = { ReceiveWithAuthorization: AUTHORIZATION_FIELDS } as const;

const CREATE_TYPES = {
  CreateInvoice: [
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "dueAt", type: "uint64" },
    { name: "ref", type: "bytes32" },
    { name: "relayFee", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const CANCEL_TYPES = {
  CancelInvoice: [
    { name: "id", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

function expiry() {
  return BigInt(Math.floor(Date.now() / 1000) + VALID_SECONDS);
}

// Must match InvoiceRegistry.authorizationNonce byte for byte.
export function authorizationNonce(id: bigint, payer: Address) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "address" }],
      ["SETTLE_INVOICE", id, payer],
    ),
  );
}

// Must match InvoiceRegistry.refundNonce byte for byte.
export function refundNonce(id: bigint, refundedBefore: bigint) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "uint256" }],
      ["SETTLE_REFUND", id, refundedBefore],
    ),
  );
}

// Must match GaslessTransfer.transferNonce byte for byte.
export function transferNonce(to: Address, fee: bigint, salt: Hex) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      ["SETTLE_TRANSFER", to, fee, salt],
    ),
  );
}

// What a customer signs to pay. Only the registry can use it, for this exact invoice.
export function paymentAuthorization(invoice: Invoice, payer: Address) {
  return {
    domain: USDT_DOMAIN,
    types: RECEIVE_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: payer,
      to: REGISTRY_ADDRESS,
      value: invoice.amount,
      validAfter: 0n,
      validBefore: expiry(),
      nonce: authorizationNonce(invoice.id, payer),
    },
  } as const;
}

// What a merchant signs to refund. It works once, for this amount, on this invoice.
export function refundAuthorization(invoice: Invoice, amount: bigint) {
  return {
    domain: USDT_DOMAIN,
    types: RECEIVE_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: invoice.merchant,
      to: REGISTRY_ADDRESS,
      value: amount,
      validAfter: 0n,
      validBefore: expiry(),
      nonce: refundNonce(invoice.id, invoice.refunded),
    },
  } as const;
}

type TransferRequest = {
  from: Address;
  to: Address;
  amount: bigint;
  fee: bigint;
  salt: Hex;
};

// What an account signs to send its USDT without gas. Only the transfer contract can use it, and
// only for this recipient and this fee.
export function withdrawAuthorization(request: TransferRequest) {
  return {
    domain: USDT_DOMAIN,
    types: RECEIVE_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: request.from,
      to: TRANSFER_ADDRESS,
      value: request.amount,
      validAfter: 0n,
      validBefore: expiry(),
      nonce: transferNonce(request.to, request.fee, request.salt),
    },
  } as const;
}

export type CreateRequest = {
  merchant: Address;
  amount: bigint;
  dueAt: bigint;
  ref: Hex;
  relayFee: bigint;
  salt: Hex;
  deadline: bigint;
};

export function createInvoiceRequest(fields: Omit<CreateRequest, "deadline">) {
  return {
    domain: REGISTRY_DOMAIN,
    types: CREATE_TYPES,
    primaryType: "CreateInvoice",
    message: { ...fields, deadline: expiry() },
  } as const;
}

export function cancelInvoiceRequest(id: bigint) {
  return {
    domain: REGISTRY_DOMAIN,
    types: CANCEL_TYPES,
    primaryType: "CancelInvoice",
    message: { id, deadline: expiry() },
  } as const;
}

// ---------- Subscriptions ----------

const SUBSCRIPTIONS_DOMAIN = {
  name: "Settle Subscriptions",
  version: "1",
  chainId: whitechainSepolia.id,
  verifyingContract: SUBSCRIPTIONS_ADDRESS,
} as const;

const PLAN_TYPES = {
  CreatePlan: [
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "period", type: "uint32" },
    { name: "ref", type: "bytes32" },
    { name: "relayFee", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const CLOSE_PLAN_TYPES = {
  ClosePlan: [
    { name: "planId", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const SUBSCRIBE_TYPES = {
  Subscribe: [
    { name: "planId", type: "uint256" },
    { name: "subscriber", type: "address" },
    { name: "periods", type: "uint32" },
    { name: "salt", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const CANCEL_SUBSCRIPTION_TYPES = {
  CancelSubscription: [
    { name: "id", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type PlanFields = {
  merchant: Address;
  amount: bigint;
  period: number;
  ref: Hex;
  relayFee: bigint;
  salt: Hex;
};

// What a merchant signs to publish a plan without gas.
export function planRequest(fields: PlanFields) {
  return {
    domain: SUBSCRIPTIONS_DOMAIN,
    types: PLAN_TYPES,
    primaryType: "CreatePlan",
    message: { ...fields, deadline: expiry() },
  } as const;
}

export function closePlanRequest(planId: bigint) {
  return {
    domain: SUBSCRIPTIONS_DOMAIN,
    types: CLOSE_PLAN_TYPES,
    primaryType: "ClosePlan",
    message: { planId, deadline: expiry() },
  } as const;
}

// What a customer signs to join a plan. It names the plan and caps the number of charges, so
// the allowance below can't be spent on anything else.
export function subscribeRequest(fields: {
  planId: bigint;
  subscriber: Address;
  periods: number;
  salt: Hex;
}) {
  return {
    domain: SUBSCRIPTIONS_DOMAIN,
    types: SUBSCRIBE_TYPES,
    primaryType: "Subscribe",
    message: { ...fields, deadline: expiry() },
  } as const;
}

// The customer's second signature: a USDT permit that lets the contract collect each period.
// `nonce` is the token's current permit nonce for the owner.
export function subscriptionPermit(owner: Address, value: bigint, nonce: bigint) {
  return {
    domain: USDT_DOMAIN,
    types: PERMIT_TYPES,
    primaryType: "Permit",
    message: { owner, spender: SUBSCRIPTIONS_ADDRESS, value, nonce, deadline: expiry() },
  } as const;
}

// Signed by the subscriber, or by the plan's merchant.
export function cancelSubscriptionRequest(id: bigint) {
  return {
    domain: SUBSCRIPTIONS_DOMAIN,
    types: CANCEL_SUBSCRIPTION_TYPES,
    primaryType: "CancelSubscription",
    message: { id, deadline: expiry() },
  } as const;
}
