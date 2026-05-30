import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // @vitejs/plugin-react handles JSX transform (the Next.js tsconfig sets
  // `jsx: "preserve"` which vite's built-in esbuild respects, so we need the
  // plugin to actually transform JSX in .tsx files like export-pdf.tsx tests).
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    pool: "vmForks",
    setupFiles: ["./src/test-setup/next-headers-mock.ts"],
  },
});
