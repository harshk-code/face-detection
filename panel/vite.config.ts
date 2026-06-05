import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend dev proxy target (see face-detection-backend/.env.example PORT=18081).
const BACKEND = "http://localhost:18081";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": BACKEND,
      "/health": BACKEND,
      "/openapi.yaml": BACKEND
    }
  }
});
