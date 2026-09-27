import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/studio/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8788", changeOrigin: true },
      "/t": { target: "http://localhost:8788", changeOrigin: true },
      "/ingest": { target: "http://localhost:8788", changeOrigin: true },
      "/viewer": { target: "http://localhost:8788", changeOrigin: true },
      "/rt": { target: "http://localhost:8788", ws: true, changeOrigin: true },
    },
  },
  // El worker del export importa el exportador: como módulo ES
  worker: { format: "es" },
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
