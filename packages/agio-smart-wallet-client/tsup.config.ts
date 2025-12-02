import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    "agio-smart-wallet-core",
    "viem",
    "@account-kit/infra",
    "@account-kit/signer",
    "@account-kit/wallet-client",
  ],
});
