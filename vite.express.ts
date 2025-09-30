import type { Plugin } from "vite";

export default function express(path: string): Plugin {
  return {
    name: "vite3-plugin-express",
    configureServer: async (server: any) => {
      // Preload the Express app immediately when Vite starts
      process.env["VITE"] = "true";
      console.log("[vite-express] Preloading Express server...");
      
      let app: any;
      try {
        const mod = await server.ssrLoadModule(path);
        app = mod.app;
        console.log("[vite-express] Express server preloaded successfully");
      } catch (err) {
        console.error("[vite-express] Failed to preload Express server:", err);
      }

      server.middlewares.use(async (req: any, res: any, next: any) => {
        try {
          if (app) {
            app(req, res, next);
          } else {
            // Fallback: try to load app again if preload failed
            const mod = await server.ssrLoadModule(path);
            app = mod.app;
            app(req, res, next);
          }
        } catch (err) {
          console.error("[vite-express] Request handling error:", err);
          next(err);
        }
      });
    },
  };
}
