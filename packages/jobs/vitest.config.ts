import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    deps: {
      interopDefault: true,
    },
    server: {
      deps: {
        inline: [/@marine-guardian/, /src\//],
      },
    },
  },
});
