import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://144.202.0.231:8000",
        target: "http://localhost:8000", // Uncomment for local development
        changeOrigin: true,
        secure: false, // Set to true if using HTTPS
        ws: true, // Enable WebSocket proxying if needed
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.error("[Proxy Error]:", err);
          });
          proxy.on("proxyReq", (proxyReq, req, res) => {
            console.log(
              `[Proxy] Forwarding ${req.method} ${req.url} → http://144.202.0.231:8000${req.url}`
            );
          });
          proxy.on("proxyRes", (proxyRes, req, res) => {
            console.log(
              `[Proxy] Response ${proxyRes.statusCode} for ${req.method} ${req.url}`
            );
          });
        },
      },
    },
  },
});
