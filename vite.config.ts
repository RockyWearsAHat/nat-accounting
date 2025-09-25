import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";
import expressPlugin from "./vite.express";

export default defineConfig(({ command, mode }) => {
  return {
    root: resolve(__dirname, "src/client"),
    plugins: [react(), expressPlugin("../server/index.ts")],
    server: {
      port: 4000,
      // Ensure proper MIME types for modules
      headers: {
        'Cache-Control': 'no-cache'
      }
    },
    build: {
      outDir: "../../dist/client",
      emptyOutDir: true,
      rollupOptions: { 
        input: resolve(__dirname, "src/client/index.html"),
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'utils': ['date-fns', 'date-fns-tz']
          }
        }
      },
      // Performance optimizations
      target: 'esnext',
      minify: 'esbuild',
      sourcemap: false,
      // Enable compression
      assetsInlineLimit: 4096,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1000
    },
    // CSS optimizations
    css: {
      devSourcemap: mode === 'development',
    },
    // Dependency optimization
    optimizeDeps: {
      include: ['react', 'react-dom', 'date-fns', 'date-fns-tz'],
    },
  };
});
