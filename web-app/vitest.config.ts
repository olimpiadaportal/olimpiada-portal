// Vitest for the web app. Mirrors admin-panel/vitest.config.ts (same runner,
// same version, same `src/**/*.test.ts` convention) so the repo has ONE test
// toolchain rather than two.
//
// Node environment, no DOM plugins: the suite covers PURE logic modules
// (lib/*), which is where the project rule "add tests for security-sensitive
// logic / keep business logic out of visual components" points the tests.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Same "@/*" → "./src/*" mapping as tsconfig.json.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
