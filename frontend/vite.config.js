// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Removed proxy for /api so API requests go directly to the host configured
    // via `VITE_API_URL` (e.g. your deployed backend). Keeping a small /ws proxy
    // is useful for local websocket testing — adjust or remove as you prefer.
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:8000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
