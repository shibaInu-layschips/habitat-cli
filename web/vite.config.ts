import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "");
  const apiTarget = `http://localhost:${env.HABITAT_API_PORT || "8787"}`;

  return {
  root: webRoot,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/health": apiTarget,
      "/registration": apiTarget,
      "/status": apiTarget,
      "/state": apiTarget,
      "/modules": apiTarget,
      "/simulation": apiTarget,
      "/solar": apiTarget,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  };
});
