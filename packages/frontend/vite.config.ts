import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
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
