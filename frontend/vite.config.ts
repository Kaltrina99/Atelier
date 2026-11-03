import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const repository = process.env.GITHUB_REPOSITORY ?? "";
const pageBase = repository && !repository.endsWith(".github.io")
  ? `/${repository.split("/")[1]}/`
  : "/";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? pageBase : "/",
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Calls to /api go to the .NET backend — no CORS fuss in development.
    proxy: { "/api": "http://localhost:5080" },
  },
});
