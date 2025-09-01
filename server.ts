import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import * as vite from "vite";
import { createApiApp } from "./backend/src/index.js";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createServer() {
  const isProd = process.env.NODE_ENV === "production";
  const root = path.resolve(__dirname, "frontend");

  const app = await createApiApp();

  let viteServer: vite.ViteDevServer | undefined;
  if (!isProd) {
    viteServer = await vite.createServer({
      root,
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(viteServer.middlewares);
  } else {
    app.use((await import("compression")).default());
    app.use(
      express.static(path.resolve(root, "dist/client"), { index: false })
    );
  }

  app.use("*", async (req, res, next) => {
    try {
      const url = req.originalUrl;
      let template: string;
      let render: (url: string) => Promise<{ html: string; head?: string }>;
      if (!isProd && viteServer) {
        // Always read fresh template in dev
        template = fs.readFileSync(path.resolve(root, "index.html"), "utf-8");
        template = await viteServer.transformIndexHtml(url, template);
        render = (await viteServer.ssrLoadModule("/src/entry-server.tsx"))
          .render;
      } else {
        template = fs.readFileSync(
          path.resolve(root, "dist/client/index.html"),
          "utf-8"
        );
        render = (await import("./frontend/dist/server/entry-server.js"))
          .render;
      }
      const { html, head } = await render(url);
      const finalHtml = template
        .replace("<!--app-head-->", head || "")
        .replace("<!--app-html-->", html);
      res.status(200).set({ "Content-Type": "text/html" }).end(finalHtml);
    } catch (e: any) {
      if (viteServer) viteServer.ssrFixStacktrace(e);
      next(e);
    }
  });

  const port = process.env.PORT || 4000;
  app.listen(port, () =>
    console.log(`Unified SSR server listening on :${port}`)
  );
}

createServer();
