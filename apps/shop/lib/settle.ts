// #region settle
import Settle from "settle-pay";

export const settle = () =>
  new Settle({
    keyId: process.env.SETTLE_KEY_ID as string,
    keySecret: process.env.SETTLE_KEY_SECRET as string,
    businessName: "Chai Point",
  });
// #endregion
