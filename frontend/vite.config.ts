import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api to the FastAPI backend during development so the frontend can
// call relative URLs without CORS friction.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Anchored so it matches /api/... only. A bare "/api" key also matches
      // /api-static/..., which is where the static snapshot lives.
      "^/api/": {
        // Use explicit IPv4 — uvicorn binds 127.0.0.1, but "localhost" can
        // resolve to IPv6 ::1 first, causing 502s from the proxy.
        target: process.env.VITE_API_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
