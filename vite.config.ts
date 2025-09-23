import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import expressPlugin from "./vite.express";

export default defineConfig(({ command, mode }) => {
  return {
    root: path.resolve(__dirname, "src/client"),
    plugins: [react(), expressPlugin("../server/index.ts")],
    server: {
      port: 4000,
    },
    build: {
      outDir: "../../dist/client",
      rollupOptions: { input: path.resolve(__dirname, "src/client/index.html") },
    },
  };
});
