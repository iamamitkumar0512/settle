import "server-only";
import {
  encodeFunctionData,
  isAddress,
  parseAbi,
  parseAbiItem,
  verifyTypedData,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import {
  agentSaleNonce,
  TRANSFER_TYPES,
  type AgentSale,
  type AgentSaleDetails,
} from "@/lib/agent-sale";
import { whitechainSepolia } from "@/lib/chains";
import { USDT_ADDRESS } from "@/lib/contracts";
import { logsClient } from "@/lib/logs-client";
import {
  readAgentSaleRecords,
  writeAgentSale,
  type AgentSaleRecord,
} from "./arkiv";
import { coversNewRequest, relayFees } from "./gas-fee";
import { allow, DAY } from "./rate-limit";
import { addressField, bytes32Field, signatureField, uintField } from "./relay-http";
import {
  chainClient,
  MIN_INVOICE,
  prepareRelay,
  relay,
  RelayError,
  relayerAccount,
} from "./relayer";

export const X402_NETWORK = `eip155:${whitechainSepolia.id}`;
const MULTICALL = whitechainSepolia.contracts.multicall3.address;
const USDT_DOMAIN = {
  name: "Tether USD",
  version: "1",
  chainId: whitechainSepolia.id,
  verifyingContract: USDT_ADDRESS,
} as const;

// The merchant repays the gas, so this only caps what a failed race could cost the relayer.
const SALES_PER_DAY = Number(process.env.AGENT_SALES_PER_DAY ?? "200");
const BLOCKS_PER_REQUEST = 10_000n;
const TEXT_LIMIT = 200;

const tokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
]);
const multicallAbi = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])",
]);
const AuthorizationUsed = parseAbiItem(
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
);

type Authorization = {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

export type AgentPayment = {
  authorization: Authorization;
  signature: Hex;
  merchant: Address;
  amount: bigint;
};

function refuse(reason: string): never {
  throw new RelayError(400, reason);
}

function record(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function nowSeconds() {
  return BigInt(Math.floor(Date.now() / 1000));
}

// Everything that can be judged without touching the chain. A forged or altered payment stops
// here, so it costs nothing.
export async function checkPayment(body: Record<string, unknown>): Promise<AgentPayment> {
  const payment = record(body.paymentPayload);
  const offer = record(body.paymentRequirements);
  const { signature: rawSignature, authorization: rawAuthorization } = record(payment.payload);
  const fields = record(rawAuthorization);

  if (offer.scheme !== "exact") refuse("unsupported_scheme");
  if (offer.network !== X402_NETWORK) refuse("invalid_network");
  if (typeof offer.asset !== "string" || offer.asset.toLowerCase() !== USDT_ADDRESS.toLowerCase()) {
    refuse("invalid_asset");
  }
  if (typeof offer.payTo !== "string" || !isAddress(offer.payTo)) refuse("invalid_pay_to");

  let authorization: Authorization;
  let signature: Hex;
  let amount: bigint;
  try {
    authorization = {
      from: addressField(fields.from),
      to: addressField(fields.to),
      value: uintField(fields.value),
      validAfter: uintField(fields.validAfter),
      validBefore: uintField(fields.validBefore),
      nonce: bytes32Field(fields.nonce),
    };
    signature = signatureField(rawSignature);
    amount = uintField(offer.amount);
  } catch {
    refuse("invalid_exact_evm_payload");
  }

  if (authorization.to.toLowerCase() !== offer.payTo.toLowerCase()) {
    refuse("invalid_exact_evm_payload_recipient_mismatch");
  }
  if (authorization.value !== amount) refuse("invalid_exact_evm_payload_authorization_value");
  if (amount < MIN_INVOICE) refuse("amount_below_minimum");
  const now = nowSeconds();
  if (authorization.validBefore < now + 10n) {
    refuse("invalid_exact_evm_payload_authorization_valid_before");
  }
  if (authorization.validAfter > now) {
    refuse("invalid_exact_evm_payload_authorization_valid_after");
  }

  const isSigned = await verifyTypedData({
    address: authorization.from,
    domain: USDT_DOMAIN,
    types: TRANSFER_TYPES,
    primaryType: "TransferWithAuthorization",
    message: authorization,
    signature,
  }).catch(() => false);
  if (!isSigned) refuse("invalid_exact_evm_payload_signature");

  return { authorization, signature, merchant: authorization.to, amount };
}

function isUsed({ from, nonce }: Pick<Authorization, "from" | "nonce">) {
  return chainClient.readContract({
    address: USDT_ADDRESS,
    abi: tokenAbi,
    functionName: "authorizationState",
    args: [from, nonce],
  });
}

// Whether the payment could go through right now. Reads only.
export async function checkFunds({ authorization, amount }: AgentPayment) {
  if (await isUsed(authorization)) refuse("authorization_already_used");
  const balance = await chainClient.readContract({
    address: USDT_ADDRESS,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [authorization.from],
  });
  if (balance < amount) refuse("insufficient_funds");
}

function* windows(from: bigint, to: bigint) {
  for (let start = from; start <= to; start += BLOCKS_PER_REQUEST) {
    const end = start + BLOCKS_PER_REQUEST - 1n;
    yield { fromBlock: start, toBlock: end < to ? end : to };
  }
}

// The transactions that used these authorizations. The token logs one event for each.
async function findTransactions(records: AgentSaleRecord[]) {
  const found = new Map<string, Hash>();
  if (records.length === 0) return found;
  const start = records.reduce(
    (lowest, { chainBlock }) => (chainBlock < lowest ? chainBlock : lowest),
    records[0].chainBlock,
  );
  const authorizer = [...new Set(records.map(({ payer }) => payer))];
  const latest = await logsClient.getBlockNumber({ cacheTime: 0 });
  for (const blocks of windows(start, latest)) {
    const logs = await logsClient.getLogs({
      address: USDT_ADDRESS,
      event: AuthorizationUsed,
      args: { authorizer },
      ...blocks,
    });
    for (const log of logs) {
      if (log.args.nonce) found.set(log.args.nonce.toLowerCase(), log.transactionHash);
    }
  }
  return found;
}

function toSale(sale: AgentSaleRecord, transaction: Hash): AgentSale {
  return {
    receipt: sale.receipt,
    description: sale.description,
    merchantName: sale.merchantName,
    payer: sale.payer,
    amount: String(sale.amount),
    networkFee: String(sale.networkFee),
    received: String(sale.amount - sale.networkFee),
    soldAt: new Date(Number(sale.soldAt) * 1000).toISOString(),
    transaction,
  };
}

// The chain decides what was paid. A record alone proves only that a payment was attempted.
async function usedOnly(records: AgentSaleRecord[]) {
  if (records.length === 0) return [];
  const used = await chainClient.multicall({
    allowFailure: false,
    contracts: records.map(({ payer, nonce }) => ({
      address: USDT_ADDRESS,
      abi: tokenAbi,
      functionName: "authorizationState",
      args: [payer, nonce],
    })),
  });
  return records.filter((_, index) => used[index]);
}

// The log server can be a moment behind, so a paid sale may have no transaction to show yet.
async function withProof(records: AgentSaleRecord[]) {
  const transactions = await findTransactions(records);
  return records.flatMap((sale) => {
    const transaction = transactions.get(sale.nonce.toLowerCase());
    return transaction ? [toSale(sale, transaction)] : [];
  });
}

export function readAgentSales(merchant: Address) {
  return readAgentSaleRecords(merchant).then(usedOnly).then(withProof);
}

export type SaleState =
  | { state: "none" }
  | { state: "in_progress" }
  | { state: "paid"; sale: AgentSale };

// Where one order number stands. This is what stops a retry paying twice: a payment that went
// through is found here even if the server died before it could answer.
export async function saleState(merchant: Address, receipt: string): Promise<SaleState> {
  const records = await readAgentSaleRecords(merchant, receipt);
  const used = await usedOnly(records);
  const [sale] = await withProof(used);
  if (sale) return { state: "paid", sale };
  // Paid, but the proof can't be seen yet. It must never look like an order nobody has paid.
  if (used.length > 0) return { state: "in_progress" };
  // A signature that hasn't expired could still go through, so nothing new is taken until it has.
  const now = nowSeconds();
  return records.some(({ validBefore }) => validBefore > now)
    ? { state: "in_progress" }
    : { state: "none" };
}

function saleDetails(value: unknown): AgentSaleDetails {
  const { merchantName, receipt, description } = record(value);
  const isText = (text: unknown, min: number): text is string =>
    typeof text === "string" && text.length >= min && text.length <= TEXT_LIMIT;
  if (!isText(merchantName, 1) || !isText(receipt, 1) || !isText(description, 0)) {
    refuse("invalid_sale");
  }
  return { merchantName, receipt, description };
}

const salesInFlight = new Set<string>();

// Sends the agent's payment and the merchant's gas repayment as one transaction, so the relayer
// is never out of pocket for a sale that went through. Standard x402 sends only the first part;
// the second is what makes the merchant, not Settle, pay for the gas.
export async function settleAgentSale(body: Record<string, unknown>) {
  const payment = await checkPayment(body);
  const { authorization, merchant, amount } = payment;
  const details = saleDetails(body.sale);

  const repayment = record(body.repayment);
  if (typeof repayment.signature !== "string") refuse("merchant_repayment_required");
  const fee = uintField(repayment.value);
  const validBefore = uintField(repayment.validBefore);
  if (validBefore < nowSeconds() + 10n) refuse("repayment_expired");
  if (fee >= amount) refuse("amount_below_minimum");
  const { agentFee } = await relayFees();
  if (!coversNewRequest(fee, agentFee)) refuse("repayment_too_low");

  const relayer = relayerAccount().address;
  const repaid: Authorization = {
    from: merchant,
    to: relayer,
    value: fee,
    validAfter: 0n,
    validBefore,
    nonce: agentSaleNonce(authorization.nonce, details),
  };
  const repaymentSignature = signatureField(repayment.signature);
  const isMerchant = await verifyTypedData({
    address: merchant,
    domain: USDT_DOMAIN,
    types: TRANSFER_TYPES,
    primaryType: "TransferWithAuthorization",
    message: repaid,
    signature: repaymentSignature,
  }).catch(() => false);
  if (!isMerchant) refuse("invalid_repayment_signature");

  const key = `${merchant}:${details.receipt}`;
  if (salesInFlight.has(key)) throw new RelayError(409, "payment_in_progress");
  salesInFlight.add(key);
  try {
    const records = await readAgentSaleRecords(merchant, details.receipt);
    const used = await usedOnly(records);
    const [sold] = await withProof(used);
    if (sold) return { sale: sold, repeat: true };
    if (used.length > 0) throw new RelayError(409, "payment_in_progress");

    const now = nowSeconds();
    const isThisPayment = (nonce: Hex) =>
      nonce.toLowerCase() === authorization.nonce.toLowerCase();
    if (records.some(({ nonce, validBefore: until }) => !isThisPayment(nonce) && until > now)) {
      throw new RelayError(409, "payment_in_progress");
    }

    // Someone sent the agent's signature to the token directly. The merchant has the money and
    // the relayer spent nothing, so the sale stands with no fee.
    const usedElsewhere = await isUsed(authorization);
    const isSaved = records.some(({ nonce }) => isThisPayment(nonce));
    const settlement = {
      address: MULTICALL,
      abi: multicallAbi,
      functionName: "aggregate3",
      args: [
        [
          { from: authorization, signature: payment.signature },
          { from: repaid, signature: repaymentSignature },
        ].map(({ from: { from, to, value, validAfter, validBefore: until, nonce }, signature }) => ({
          target: USDT_ADDRESS,
          allowFailure: false,
          callData: encodeFunctionData({
            abi: tokenAbi,
            functionName: "transferWithAuthorization",
            args: [from, to, value, validAfter, until, nonce, signature],
          }),
        })),
      ],
    };
    // Before anything is saved, so an empty relayer or a payment that can't succeed leaves no trace.
    if (!usedElsewhere) {
      await checkFunds(payment);
      await prepareRelay(settlement);
    }

    const latest = await chainClient.getBlockNumber();
    const sale: Omit<AgentSaleRecord, "soldAt"> = {
      ...details,
      merchant,
      payer: authorization.from,
      nonce: authorization.nonce,
      amount,
      networkFee: usedElsewhere ? 0n : fee,
      validBefore: authorization.validBefore,
      // A payment someone else sent is already behind us, so the search starts further back.
      chainBlock: usedElsewhere ? latest - BLOCKS_PER_REQUEST : latest,
    };

    if (!isSaved) {
      // Saved first: if this fails, no money moves, and if the server dies after sending, a retry
      // finds this record and doesn't charge again.
      if (!allow(`agent-sale:${merchant.toLowerCase()}`, SALES_PER_DAY, DAY)) {
        throw new RelayError(429, "daily_limit_reached");
      }
      await writeAgentSale(sale);
    }

    if (usedElsewhere) {
      const [found] = await withProof([{ ...sale, soldAt: now }]);
      if (!found) throw new RelayError(409, "payment_in_progress");
      return { sale: found, repeat: false };
    }

    const { hash } = await relay(settlement);
    return { sale: toSale({ ...sale, soldAt: now }, hash), repeat: false };
  } finally {
    salesInFlight.delete(key);
  }
}
