import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import expressPlugin from "./vite.express";

export default defineConfig(({ command, mode }) => {
  const isProd = mode === "production";
  return {
    root: path.resolve(__dirname, "frontend"),
    plugins: [react(), expressPlugin("../backend/src/index.ts")],
    server: {
      port: 5173,
    },
    build: {
      outDir: "dist/client",
      manifest: true,
      rollupOptions: { input: "index.html" },
    },
    ssr: { noExternal: [] },
  };
});
