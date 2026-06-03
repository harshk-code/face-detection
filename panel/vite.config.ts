import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:18081",
      "/health": "http://localhost:18081",
      "/openapi.yaml": "http://localhost:18081"
    }
  }
});
