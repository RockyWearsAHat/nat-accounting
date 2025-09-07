import "./loadEnv.js";
import express from "express";
import cors from "cors";
import { connect } from "./mongo.js";
import consultationRouter from "./routes/consultations.js";
import availabilityRouter from "./routes/availability.js";
import scheduleRouter from "./routes/schedule.js";
import authRouter from "./routes/auth.js";
import calendarRouter from "./routes/calendar.js";
import icloudRouter from "./routes/icloud.js";
import hoursRouter from "./routes/hours.js";
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
    app.use("/api/hours", hoursRouter);
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
