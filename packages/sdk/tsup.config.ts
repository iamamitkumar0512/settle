import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "node20",
  // So `const Settle = require("@akhr2405/settle-pay")` works, as it does with other gateways' SDKs.
  footer: ({ format }) =>
    format === "cjs"
      ? { js: "module.exports = Object.assign(module.exports.default, module.exports);" }
      : {},
});
