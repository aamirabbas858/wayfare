import { defineConfig } from "vitest/config";

// tsconfigPaths so tests resolve the same "@/..." aliases the app uses —
// without it a test could import a different module than production does.
// Native since Vite 7; the vite-tsconfig-paths plugin is no longer needed.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
