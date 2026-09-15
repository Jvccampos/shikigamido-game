import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
export default defineConfig({
  plugins: [preact()],
  server: {
    host: "0.0.0.0",
    port: 5175,
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: false },
      "/socket": {
        target: "ws://127.0.0.1:3000",
        ws: true,
        changeOrigin: false,
      },
    },
  },
  build: { outDir: "dist/client", sourcemap: true },
  publicDir: "public",
});
