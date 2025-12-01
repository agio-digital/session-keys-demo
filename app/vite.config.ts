import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const certsDir = path.resolve(__dirname, "certs");
const keyPath = path.join(certsDir, "key.pem");
const certPath = path.join(certsDir, "cert.pem");

if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  execSync(`mkcert -key-file "${keyPath}" -cert-file "${certPath}" localhost`, {
    stdio: "pipe",
  });
}

export default defineConfig({
  plugins: [
    vue(),
    nodePolyfills({
      include: ["http", "https", "crypto", "stream", "util", "buffer"],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 8081,
    https: {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    },
    hmr: {
      protocol: "wss",
      host: "localhost",
      port: process.env.PORT ? Number(process.env.PORT) : 8081,
    },
    proxy: {
      '/api': {
        target: 'https://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
