import type { Plugin } from "vite";

// Vite dev-only plugin to mount Express instance produced by module exporting getApiApp()
export default function expressPlugin(entry: string): Plugin {
  return {
    name: "vite-plugin-express-bridge",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const mod: any = await server.ssrLoadModule(entry);
          const app = mod.getApiApp
            ? await mod.getApiApp()
            : mod.app || mod.default?.app;
          if (!app) return next();
          app(req, res, next);
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          console.error("[express-plugin]", err);
          next(err);
        }
      });
    },
  };
}
