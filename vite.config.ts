import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // The web build is served by the Polemic server under /cursive.
  base: mode === "web" ? "/cursive/" : "/",
  build: { outDir: mode === "web" ? "dist-web" : "dist" },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
  // The desktop app loads the dev server from a fixed port, and its
  // Rust errors stay on screen.
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
    // `pnpm dev:web` runs the web build against a Polemic server on
    // this computer (polemic-server's `pnpm dev`).
    proxy:
      mode === "web"
        ? {
            "/api": {
              target: process.env.CURSIVE_SERVER ?? "http://localhost:3000",
              ws: true,
            },
          }
        : undefined,
  },
}));
