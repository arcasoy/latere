import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run dev` serves the UI with HMR here and proxies /api to `npm run
// dev:server`, so the live API — panels, shots, renders, the review gate —
// works against a real server rather than a mock. `npm run build` writes
// ./dist, which the server itself serves in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4322,
    proxy: {
      "/api": { target: "http://localhost:4323", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
