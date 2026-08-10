import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Same "@/*" → "./src/*" mapping as tsconfig.json, mirroring
      // web-app/vitest.config.ts. Without it any spec touching a module that
      // uses the alias fails at import-analysis with an unresolved path — which
      // quietly pushed security-sensitive server modules out of the suite.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` is a BUILD-TIME guard: it exists so importing a module
      // from client code fails the Next build. It has no runtime behaviour to
      // exercise, and it does not resolve under Vite, so it is stubbed out.
      // Stubbing the marker keeps the guard exactly where it belongs (the real
      // build) instead of tempting anyone to delete it from production files to
      // make a test pass.
      "server-only": fileURLToPath(new URL("./vitest.server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
