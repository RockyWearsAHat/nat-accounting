import { Router } from "express";
import ical from "node-ical";
// Very simple in-memory storage of a single calendar feed URL
let calendarFeedUrl = null;
const router = Router();
// Set or update the iCal feed URL (admin only in future)
router.post("/link", (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== "string")
        return res.status(400).json({ error: "url_required" });
    calendarFeedUrl = url;
    res.json({ ok: true });
});
// Fetch today's events; logs them to the server console & returns summary
router.get("/today", async (_req, res) => {
    if (!calendarFeedUrl)
        return res.json({ events: [] });
    try {
        const data = await ical.async.fromURL(calendarFeedUrl);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const events = [];
        for (const k of Object.keys(data)) {
            const ev = data[k];
            if (ev.type === "VEVENT" && ev.start) {
                const start = ev.start;
                if (start >= today && start < tomorrow) {
                    events.push({
                        summary: ev.summary,
                        start: start.toISOString(),
                        end: ev.end?.toISOString(),
                        location: ev.location,
                    });
                }
            }
        }
        console.log("Today's iCal events:", events);
        res.json({ events });
    }
    catch (e) {
        console.error("iCal fetch error", e);
        res.status(500).json({ error: "calendar_fetch_failed" });
    }
});
export default router;
