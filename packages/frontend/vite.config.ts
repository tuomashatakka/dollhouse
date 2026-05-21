import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    // The editor package is consumed from source; dedupe these so the editor
    // and the frontend share a single instance of each.
    dedupe: ["react", "react-dom", "three", "@react-three/fiber", "@react-three/drei"],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  define: {
    __BACKEND_URL__: JSON.stringify(
      process.env.BACKEND_URL ?? "http://localhost:4000",
    ),
  },
});
