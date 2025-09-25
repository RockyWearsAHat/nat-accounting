import { loadEnv } from "./loadEnv";
import express, { Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { connect } from "./mongo";
import { router as consultationRouter } from "./routes/consultations";
import { router as availabilityRouter } from "./routes/availability";
import { router as scheduleRouter } from "./routes/schedule";
import { router as authRouter } from "./routes/auth";
import { router as calendarRouter } from "./routes/calendar";
import { router as icloudRouter } from "./routes/icloud";
import { router as googleRouter } from "./routes/google";
import { router as mergedRouter } from "./routes/merged";
import { router as hoursRouter } from "./routes/hours";
import { router as settingsRouter } from "./routes/settings";
import cookieParser from "cookie-parser";

export async function createApiApp(): Promise<Express> {
  loadEnv();
  await connect();
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/consultations", consultationRouter);
  app.use("/api/availability", availabilityRouter);
  app.use("/api/schedule", scheduleRouter);
  app.use("/api/calendar", calendarRouter);
  app.use("/api/icloud", icloudRouter);
  app.use("/api/google", googleRouter);
  app.use("/api/merged", mergedRouter);
  app.use("/api/hours", hoursRouter);
  app.use("/api/settings", settingsRouter);

  // Serve static files when not on Netlify (local development/production)
  if (!process.env.NETLIFY) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const clientPath = path.join(__dirname, "../client");
    
    // Serve static assets
    app.use(express.static(clientPath));
    
    // Handle client-side routing - serve index.html for non-API routes
    app.get("*", (req, res) => {
      if (!req.path.startsWith("/api")) {
        res.sendFile(path.join(clientPath, "index.html"));
      } else {
        res.status(404).json({ error: "API endpoint not found" });
      }
    });
  }

  return app;
}

let _apiAppPromise: Promise<Express> | null = null;
export function getApiApp(): Promise<Express> {
  if (!_apiAppPromise) _apiAppPromise = createApiApp();
  return _apiAppPromise;
}

// Allow standalone run (still helpful for debugging separate API)
if (process.env.STANDALONE_API || process.env.NODE_ENV === 'production') {
  createApiApp().then((app) => {
    const port = process.env.PORT || 4000;
    app.listen(port, () =>
      console.log(`API server listening on :${port}`)
    );
  });
}
