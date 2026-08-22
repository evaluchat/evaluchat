import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@opencanvas/shared/github-research/crypto": path.resolve(
        __dirname,
        "../../packages/shared/src/github-research/crypto.ts"
      ),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
