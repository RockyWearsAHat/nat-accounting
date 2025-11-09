import "./loadEnv";
import express from "express";
import cors from "cors";
import { connect } from "./mongo";
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
      "https://nat-accounting.com", // If you have a custom domain
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

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

const startServer = async () => {
  // Set up database connection FIRST
  try {
    await connect();
    console.log("✅ Database connected for main application");
  } catch (error) {
    console.error("Failed to set up database connection:", error);
  }

  // Import and mount routes AFTER database is connected
  const { router: consultationRouter } = await import("./routes/consultations");
  const { default: availabilityRouter } = await import("./routes/availability-simple");
  const { router: scheduleRouter } = await import("./routes/schedule");
  const { router: authRouter } = await import("./routes/auth");
  const { router: calendarRouter } = await import("./routes/calendar");
  const { router: icloudRouter } = await import("./routes/icloud");
  const { router: googleRouter } = await import("./routes/google");
  const { router: mergedRouter } = await import("./routes/merged");
  const { router: cachedRouter } = await import("./routes/cached");
  const { router: hoursRouter } = await import("./routes/hours");
  const { router: settingsRouter } = await import("./routes/settings");
  const { router: debugRouter } = await import("./routes/debug");
  const { default: zoomRouter } = await import("./routes/zoom");
  const { default: meetingsRouter } = await import("./routes/meetings");
  const { default: pricingRouter } = await import("./routes/pricing");

  // Mount all API routes AFTER database connection
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
  // Debug routes only in development
  if (process.env.NODE_ENV !== "production") {
    app.use("/api/debug", debugRouter);
  }
  app.use("/api/zoom", zoomRouter);

  // Initialize calendar cache immediately on startup
  console.log("🚀 Starting calendar cache initialization...");
  const { initializeCalendarCache, startBackgroundSync } = await import("./services/CalendarInitializer");
  
  // Populate cache with all existing events on startup
  try {
    console.log("📅 Calling initializeCalendarCache...");
    await initializeCalendarCache();
    console.log("✅ Calendar cache populated successfully");
  } catch (error) {
    console.error("❌ Calendar cache initialization failed:", error);
    // Continue startup even if cache init fails
  }
  
  // Start background sync for ongoing updates
  startBackgroundSync();

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
    // Add any cleanup logic here if needed
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
    // Add cleanup logic here
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
    // Add cleanup logic here
  } catch (shutdownError) {
    console.error("Error during rejection shutdown:", shutdownError);
  } finally {
    process.exit(1);
  }
});

export const handler = serverless(app);