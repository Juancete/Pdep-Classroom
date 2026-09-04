import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    environmentOptions: {
      jsdom: {
        url: "http://localhost:3000",
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        // Infraestructura que depende de servicios externos
        "src/infrastructure/auth/auth.ts",
        "src/infrastructure/db.ts",
        "src/app/api/auth/**",
        // Tipos
        "src/types/**",
      ],
      reporter: ["text", "lcov"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
});
