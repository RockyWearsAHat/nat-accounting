import "./loadEnv";
import express from "express";
import cors from "cors";
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
export async function createApiApp() {
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
    return app;
}
let _apiAppPromise = null;
export function getApiApp() {
    if (!_apiAppPromise)
        _apiAppPromise = createApiApp();
    return _apiAppPromise;
}
// Allow standalone run (still helpful for debugging separate API)
if (process.env.STANDALONE_API) {
    createApiApp().then((app) => {
        const port = process.env.PORT || 4000;
        app.listen(port, () => console.log(`API (standalone) listening on :${port}`));
    });
}
