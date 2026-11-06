import { gaslessTransferAbi, TRANSFER_ADDRESS } from "@/lib/contracts";
import {
  addressField,
  bytes32Field,
  checkWindow,
  relayRoute,
  uintField,
  vrsFields,
} from "@/lib/server/relay-http";
import { coversNewRequest, relayFees } from "@/lib/server/gas-fee";
import { relay, RelayError } from "@/lib/server/relayer";

// Sends an account's USDT to any address. The fee repays the gas and comes out of the amount, so
// this needs no login and no daily cap: the signature is the authorization.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const from = addressField(body.from);
    const to = addressField(body.to);
    const amount = uintField(body.amount);
    const fee = uintField(body.fee);
    const salt = bytes32Field(body.salt);
    const validAfter = uintField(body.validAfter);
    const validBefore = uintField(body.validBefore);
    const { v, r, s } = vrsFields(body);
    checkWindow(validBefore);
    const { withdrawFee } = await relayFees();
    if (!coversNewRequest(fee, withdrawFee)) throw new RelayError(400, "relay_fee_too_low");
    if (amount <= fee) throw new RelayError(400, "FeeTooLarge");

    const { hash } = await relay({
      address: TRANSFER_ADDRESS,
      abi: gaslessTransferAbi,
      functionName: "sendWithAuthorization",
      args: [{ from, to, amount, fee, salt, validAfter, validBefore }, v, r, s],
    });
    return { txHash: hash };
  });
}
