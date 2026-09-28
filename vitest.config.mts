import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  resolve: {
    // Mirrors the "@/*" path alias from tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Loads all variables from .env / .env.local (not only VITE_*), so the
    // database tests can reach the Supabase project "auswahltool-test".
    env: loadEnv(mode, process.cwd(), ""),
    // Database tests talk to Supabase over the network.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
}));
