import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    "agio-smart-wallet-core",
    "viem",
    "@aa-sdk/core",
    "@account-kit/infra",
    "@account-kit/wallet-client",
  ],
});
