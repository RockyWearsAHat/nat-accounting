import "./loadEnv";
import express from "express";
import cors from "cors";
import { connectDB, disconnectDB } from "./mongo";
import cookieParser from "cookie-parser";
import serverless from "serverless-http";

export const app = express();

// 🌐 NETLIFY: Configure Express to trust Netlify's proxy
app.set("trust proxy", true);

// Apply CORS before other middleware
app.use(cors({
  origin: function (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) {
    // Allow requests with no origin (e.g., mobile apps, Postman) only in development
    if (!origin && process.env.NODE_ENV !== "production") {
      return callback(null, true);
    }

    // Define allowed origins (your domains)
    const allowedOrigins = [
      "http://localhost:4000", // Local
      "http://localhost:5173", // Vite dev server
      "https://mayraccountingservices.netlify.app", // Netlify domain
      "https://mayrconsultingservices.com"
    ];

    if (origin && allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`🚨 CORS blocked request from: ${origin || "unknown"}`);
      callback(null, true); // Allow for now during development
    }
  },
  credentials: true, // Allow cookies/auth headers
  optionsSuccessStatus: 200, // Support legacy browsers
}));

// Cookie parser for HttpOnly cookies
app.use(cookieParser());

// Body parsers
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// 🔥 CRITICAL: Ensure database connection before processing any API request (serverless requirement)
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    res.status(503).json({ error: "Service temporarily unavailable - database connection failed" });
  }
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Import and mount ALL routes at MODULE LEVEL (before startServer)
// This ensures routes are available immediately when the module loads (required for serverless)
import { router as consultationRouter } from "./routes/consultations.js";
import availabilityRouter from "./routes/availability-simple.js";
import { router as scheduleRouter } from "./routes/schedule.js";
import { router as authRouter } from "./routes/auth.js";
import { router as calendarRouter } from "./routes/calendar.js";
import { router as icloudRouter } from "./routes/icloud.js";
import { router as googleRouter } from "./routes/google.js";
import { router as mergedRouter } from "./routes/merged.js";
import { router as cachedRouter } from "./routes/cached.js";
import { router as hoursRouter } from "./routes/hours.js";
import { router as settingsRouter } from "./routes/settings.js";
import { router as debugRouter } from "./routes/debug.js";
import zoomRouter from "./routes/zoom.js";
import meetingsRouter from "./routes/meetings.js";
import pricingRouter from "./routes/pricing.js";
import clientRouter from "./routes/client.js";
import documentsRouter from "./routes/documents.js";
import subscriptionsRouter from "./routes/subscriptions.js";
import invoicesRouter from "./routes/invoices.js";
import clientsRouter from "./routes/clients.js";

// Mount all API routes at MODULE LEVEL (before startServer - matches working example)
app.use("/api/auth", authRouter);
app.use("/api/consultations", consultationRouter);
app.use("/api/availability", availabilityRouter);
app.use("/api/schedule", scheduleRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/icloud", icloudRouter);
app.use("/api/google", googleRouter);
app.use("/api/cached", cachedRouter);
app.use("/api/merged", mergedRouter);
app.use("/api/hours", hoursRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/meetings", meetingsRouter);
app.use("/api/pricing", pricingRouter);
app.use("/api/client", clientRouter);
app.use("/api/client/documents", documentsRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/zoom", zoomRouter);

// Debug routes only in development
if (process.env.NODE_ENV !== "production") {
  app.use("/api/debug", debugRouter);
}

const startServer = async () => {
  // ✅ Database connection happens AFTER routes are mounted (matches working example)
  try {
    await connectDB();
    console.log("✅ Database connected for main application");
  } catch (error) {
    console.error("❌ Failed to set up database connection:", error);
    // Continue startup - routes will fail gracefully if DB needed
  }

  // Initialize calendar cache (skip in serverless - too slow for cold starts)
  if (!process.env["NETLIFY"]) {
    try {
      console.log("🚀 Starting calendar cache initialization...");
      const { initializeCalendarCache, startBackgroundSync } = await import("./services/CalendarInitializer");

      console.log("📅 Calling initializeCalendarCache...");
      await initializeCalendarCache();
      console.log("✅ Calendar cache populated successfully");

      // Start background sync for ongoing updates
      startBackgroundSync();
    } catch (error) {
      console.error("❌ Calendar cache initialization failed:", error);
    }
  }

  if (process.env && process.env["VITE"]) {
    // If running in dev, just run the server from vite, vite plugin to run express is used (SEE vite.config.ts)
    console.log("Running in dev mode - routes mounted, sync service initialized, ready for requests");
    // DO NOT mount express.static or catch-all route in dev mode, but routes are already mounted above!
    return;
  } else {
    // Serve static files from dist (not public) in production
    const frontendFiles = process.cwd() + "/dist/client/";
    app.use(express.static(frontendFiles));

    // Only serve index.html for requests that accept HTML (not for assets)
    app.get("/*", async (_req, res) => {
      try {
        // In serverless environment, Netlify handles static files
        if (process.env["NETLIFY"]) {
          res.status(404).json({ error: "Route not found" });
          return;
        }
        res.sendFile("index.html", { root: frontendFiles });
      } catch (error) {
        console.error("Error serving index.html:", error);
        res.status(404).json({ error: "Page not found" });
      }
    });

    // If running on netlify, server is ran via lambda functions created by serverless-http,
    // so if not, start the server
    if (process.env["NETLIFY"]) return;

    app.listen(process.env.PORT || 4000, async () => {
      console.log(
        !process.env["NETLIFY"] ? "Server started on http://localhost:4000" : ""
      );
    });
  }
};

startServer();

// Flag to prevent multiple shutdown attempts
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    console.log(`📥 ${signal} received, but shutdown already in progress`);
    return;
  }

  isShuttingDown = true;
  console.log(`📥 ${signal} received, shutting down gracefully`);

  try {
    // Close database connection
    await disconnectDB();
    console.log("✅ Graceful shutdown completed");
  } catch (error) {
    console.error("Error during shutdown:", error);
  } finally {
    process.exit(0);
  }
};

// Graceful shutdown handling
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGQUIT", () => gracefulShutdown("SIGQUIT"));

// Handle uncaught exceptions
process.on("uncaughtException", async (error) => {
  if (isShuttingDown) return;

  console.error("📥 Uncaught Exception:", error);
  isShuttingDown = true;

  try {
    await disconnectDB();
  } catch (shutdownError) {
    console.error("Error during exception shutdown:", shutdownError);
  } finally {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on("unhandledRejection", async (reason, promise) => {
  if (isShuttingDown) return;

  console.error("📥 Unhandled Rejection at:", promise, "reason:", reason);
  isShuttingDown = true;

  try {
    await disconnectDB();
  } catch (shutdownError) {
    console.error("Error during rejection shutdown:", shutdownError);
  } finally {
    process.exit(1);
  }
});

export const handler = serverless(app);