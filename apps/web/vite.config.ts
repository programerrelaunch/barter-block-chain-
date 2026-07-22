import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": "http://localhost:4000",
      "/health": "http://localhost:4000",
      "/api/login": {
        target: "http://localhost:4000",
        rewrite: () => "/v1/auth/login",
      },
      "/api/health": {
        target: "http://localhost:4000",
        rewrite: () => "/health",
      },
    },
  },
});
