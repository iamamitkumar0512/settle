// Checks agent payments from outside, against a running Settle and store, on a local fork or live.
// It makes one real purchase of the cheapest item. Everything refused here moves no money.
import { randomUUID } from "node:crypto";
import { toHex } from "viem";
import { account, balances, buy, NETWORK, payingFetch, setting, storeUrl, USDT } from "./pay";

const settle = setting("SETTLE_URL").replace(/\/+$/, "");
const storeAddress = setting("STORE_ADDRESS");
const PRODUCT = "ginger";
const PRICE = 1_250_000n;

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
const decode = (text: string | null) =>
  text ? JSON.parse(Buffer.from(text, "base64").toString("utf8")) : null;

const domain = { name: "Tether USD", version: "1", chainId: 1874, verifyingContract: USDT } as const;
const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const newNonce = () => toHex(crypto.getRandomValues(new Uint8Array(32)));
const inTwoMinutes = () => BigInt(Math.floor(Date.now() / 1000) + 120);

function post(body: object, signature?: string) {
  return fetch(`${storeUrl()}/api/agent/buy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "PAYMENT-SIGNATURE": signature } : {}),
    },
    body: JSON.stringify(body),
  });
}

// What a client would send, with one thing wrong in it.
async function payment(change: {
  value?: bigint;
  to?: `0x${string}`;
  validBefore?: bigint;
  claimedValue?: bigint;
  nonce?: `0x${string}`;
}) {
  const agent = account();
  const message = {
    from: agent.address,
    to: change.to ?? (storeAddress as `0x${string}`),
    value: change.value ?? PRICE,
    validAfter: 0n,
    validBefore: change.validBefore ?? inTwoMinutes(),
    nonce: change.nonce ?? newNonce(),
  };
  const signature = await agent.signTypedData({
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message,
  });
  const authorization = {
    ...message,
    value: String(change.claimedValue ?? message.value),
    validAfter: String(message.validAfter),
    validBefore: String(message.validBefore),
  };
  return encode({ x402Version: 2, payload: { signature, authorization } });
}

async function refused(name: string, signature: string, reason: RegExp) {
  const response = await post(
    { product: PRODUCT, quantity: 1, requestId: randomUUID() },
    signature,
  );
  const { error } = (await response.json()) as { error?: string };
  check(name, response.status === 402 && reason.test(error ?? ""), `${response.status} ${error}`);
}

const start = await balances();
console.log(`Agent ${start.address} holds ${start.usdtText} USDT and ${start.wbtText} WBT\n`);
check("the agent holds no WBT", start.wbt === 0n);
check("the agent can afford the test", start.usdt >= PRICE, `${start.usdtText} USDT`);

const supported = await fetch(`${settle}/api/x402/supported`).then((response) => response.json());
const kind = supported.kinds?.find(
  (item: { network: string; scheme: string }) =>
    item.network === NETWORK && item.scheme === "exact",
);
check("Settle's facilitator settles exact payments on Whitechain", Boolean(kind));

const catalog = await fetch(`${storeUrl()}/api/agent/catalog`).then((response) => response.json());
check("the catalog is free to read", catalog.products?.length > 0);

const unpaid = await post({ product: PRODUCT, quantity: 1, requestId: randomUUID() });
const offer = decode(unpaid.headers.get("PAYMENT-REQUIRED"))?.accepts?.[0];
check("no payment gets a 402 with the price", unpaid.status === 402 && offer?.amount === String(PRICE));
check(
  "the price is in the real USDT, to the store",
  offer?.asset?.toLowerCase() === USDT.toLowerCase() &&
    offer?.payTo?.toLowerCase() === storeAddress.toLowerCase() &&
    offer?.network === NETWORK,
);

await refused("a changed amount is refused", await payment({ claimedValue: PRICE + 1n }), /value|signature/);
await refused("paying too little is refused", await payment({ value: PRICE - 1n }), /value/);
await refused(
  "paying someone else is refused",
  await payment({ to: "0x000000000000000000000000000000000000dEaD" }),
  /recipient/,
);
await refused("an expired signature is refused", await payment({ validBefore: 1000n }), /valid_before/);
await refused("garbage is refused", "not-a-payment", /invalid/);
const stranger = encode({
  x402Version: 2,
  payload: {
    signature: `0x${"11".repeat(65)}`,
    authorization: {
      from: account().address,
      to: storeAddress,
      value: String(PRICE),
      validAfter: "0",
      validBefore: String(inTwoMinutes()),
      nonce: newNonce(),
    },
  },
});
await refused("a forged signature is refused", stranger, /signature/);

const capped = await buy(PRODUCT, 1, { pay: payingFetch(undefined, "1.00") });
check("a price over the agent's cap is never signed", capped.error === "over_the_agent_limit", capped.error);

const middle = await balances();
check("nothing was charged so far", middle.usdt === start.usdt);

const requestId = randomUUID();
const first = await buy(PRODUCT, 1, { requestId });
const afterSale = await balances();
check("a real purchase goes through", first.ok, first.error ?? first.order);
check("the agent paid exactly the price", start.usdt - afterSale.usdt === PRICE);
check("the agent still holds no WBT", afterSale.wbt === 0n);

const repeat = await buy(PRODUCT, 1, { requestId });
const afterRepeat = await balances();
check("the same request again is not charged", repeat.ok && afterRepeat.usdt === afterSale.usdt);
check("it gets the same order back", repeat.order === first.order && repeat.proof === first.proof);

const different = await buy(PRODUCT, 2, { requestId });
check("the same order number for something else is refused", different.status === 409, different.error);

console.log(`\nProof: ${first.proof}`);
console.log(failed === 0 ? "\nEVERYTHING PASSED" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
