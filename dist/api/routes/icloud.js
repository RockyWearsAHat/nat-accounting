import express from "express";
const router = express.Router();
import { requireAuth } from "../middleware/auth";
import { getSession, getCalendarsCache } from "../icloudSession";
import { createDAVClient } from "tsdav";
import { createCacheKey, getCachedEvents, setCachedEvents } from "../cache";
// GET /api/icloud/week - Returns all iCloud events for the given week (start/end YYYY-MM-DD)
router.get("/week", requireAuth, async (req, res) => {
    const startStr = String(req.query.start || "").trim();
    const endStr = String(req.query.end || "").trim();
    console.log("[icloud] /week called with query:", req.query);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
        console.warn("[icloud] /week invalid date params", { startStr, endStr });
        return res.status(400).json({ error: "invalid_start_or_end_date", startStr, endStr });
    }
    const [sy, sm, sd] = startStr.split("-").map((n) => parseInt(n, 10));
    const [ey, em, ed] = endStr.split("-").map((n) => parseInt(n, 10));
    const from = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    const to = new Date(ey, em - 1, ed, 23, 59, 59, 999);
    // Check cache first
    const cacheKey = createCacheKey("icloud", "week", startStr, endStr);
    const cachedEvents = await getCachedEvents(cacheKey);
    if (cachedEvents) {
        console.log("[icloud] /week cache hit", { count: cachedEvents.length });
        return res.json({
            range: { start: from.toISOString(), end: to.toISOString() },
            events: cachedEvents,
            cached: true,
        });
    }
    let session = getSession();
    if (!session) {
        console.warn("[icloud] /week no session");
        return res.status(400).json({ error: "not_connected" });
    }
    const calendarsCache = getCalendarsCache() || [];
    console.log("[icloud] /week calendarsCache", calendarsCache.map(c => ({ url: c.url, displayName: c.displayName, busy: c.busy })));
    try {
        const { appleId, appPassword } = session;
        const client = await createDAVClient({
            serverUrl: "https://caldav.icloud.com",
            credentials: { username: appleId, password: appPassword },
            authMethod: "Basic",
            defaultAccountType: "caldav",
        });
        const allEvents = [];
        for (const cal of calendarsCache) {
            try {
                const calendarObj = cal.raw || { url: cal.url };
                console.log("[icloud] /week fetching events for", cal.url, cal.displayName);
                const objects = await client.fetchCalendarObjects({
                    calendar: calendarObj,
                    timeRange: { start: from.toISOString(), end: to.toISOString() },
                    expand: false,
                });
                console.log("[icloud] /week fetched", (objects || []).length, "events for", cal.url);
                // Parse and flatten events
                const events = (objects || []).map((obj) => ({ ...obj, calendarUrl: cal.url, calendar: cal.displayName }));
                allEvents.push(...events);
            }
            catch (e) {
                // Log and skip failed calendars
                console.warn("[icloud] Week fetch failed for", cal.url, e?.message || e);
            }
        }
        // Optionally: sort by start time if present
        allEvents.sort((a, b) => (a.start && b.start ? a.start.localeCompare(b.start) : 0));
        // Cache for 5 minutes
        await setCachedEvents(cacheKey, allEvents, 300);
        console.log("[icloud] /week returning", allEvents.length, "events");
        res.json({
            range: { start: from.toISOString(), end: to.toISOString() },
            events: allEvents,
            cached: false,
        });
    }
    catch (e) {
        console.error("[icloud] week fetch error", e);
        res.status(500).json({ error: "icloud_week_failed", details: e?.message || String(e) });
    }
});
// GET /api/icloud/config - Returns iCloud calendar config for admin panel and calendar UI
router.get("/config", requireAuth, async (req, res) => {
    try {
        // Get cached calendars and config
        const calendars = getCalendarsCache() || [];
        // Load unified config from MongoDB
        const { connect } = await import("../mongo.js");
        const { CalendarConfigModel } = await import("../mongo.js");
        await connect();
        const configDoc = await CalendarConfigModel.findOne();
        const busyCalendars = configDoc?.busyCalendars || [];
        const whitelistUIDs = configDoc?.whitelistUIDs || [];
        const busyEventUIDs = configDoc?.busyEventUIDs || [];
        const calendarColors = configDoc?.calendarColors || {};
        // Mark calendars as busy if in config
        calendars.forEach((c) => {
            c.busy = busyCalendars.includes(c.url);
            if (calendarColors[c.url])
                c.color = calendarColors[c.url];
        });
        res.json({
            ok: true,
            calendars: Array.isArray(calendars) ? calendars : [],
            whitelist: whitelistUIDs,
            busyEvents: busyEventUIDs,
            colors: calendarColors,
        });
    }
    catch (e) {
        res.status(500).json({ error: "icloud_config_failed", details: e?.message || String(e) });
    }
});
// Robust /delete-event handler
// If you want to restrict to admin, you may need to implement a requireAdmin middleware. For now, using requireAuth.
router.post("/delete-event", requireAuth, async (req, res) => {
    const { uid, calendarUrl } = req.body || {};
    if (!uid)
        return res.status(400).json({ error: "uid_required" });
    let session = getSession();
    // Removed loadPersistedConfigIfNeeded as it is not defined or exported
    session = getSession();
    if (!session)
        return res.status(400).json({ error: "not_connected" });
    const calendarsCache = getCalendarsCache() || [];
    let foundEvent = null;
    let foundCalUrl = null;
    try {
        // If calendarUrl is provided, use it directly
        if (calendarUrl) {
            const cacheKey = createCacheKey(calendarUrl);
            const events = await getCachedEvents(cacheKey) || [];
            const event = events.find((e) => e.uid === uid);
            if (event && event.url) {
                foundEvent = event;
                foundCalUrl = calendarUrl;
            }
        }
        // Fallback: search all calendars (legacy)
        if (!foundEvent) {
            for (const cal of calendarsCache) {
                const cacheKey = createCacheKey(cal.url);
                const events = await getCachedEvents(cacheKey) || [];
                const event = events.find((e) => e.uid === uid);
                if (event && event.url) {
                    foundEvent = event;
                    foundCalUrl = cal.url;
                    break;
                }
            }
        }
        // Fallback: week cache for each calendar
        if (!foundEvent) {
            const now = new Date();
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            for (const cal of calendarsCache) {
                const weekKey = createCacheKey("icloud", "week", weekStart.toISOString().slice(0, 10), weekEnd.toISOString().slice(0, 10));
                const weekEvents = await getCachedEvents(weekKey) || [];
                const event = weekEvents.find((e) => e.uid === uid && e.calendarUrl === cal.url);
                if (event && event.url) {
                    foundEvent = event;
                    foundCalUrl = cal.url;
                    break;
                }
            }
        }
        // Fallback: fetch all events for the next 7 days from iCloud
        if (!foundEvent) {
            try {
                const { appleId, appPassword } = session;
                const client = await createDAVClient({
                    serverUrl: "https://caldav.icloud.com",
                    credentials: { username: appleId, password: appPassword },
                    authMethod: "Basic",
                    defaultAccountType: "caldav",
                });
                for (const cal of calendarsCache) {
                    const calendarObj = cal.raw || { url: cal.url };
                    const objects = await client.fetchCalendarObjects({
                        calendar: calendarObj,
                        timeRange: { start: new Date(Date.now() - 3 * 86400000).toISOString(), end: new Date(Date.now() + 7 * 86400000).toISOString() },
                        expand: false,
                    });
                    const allEvents = (objects || []).map((obj) => ({ ...obj, calendarUrl: cal.url }));
                    for (const ev of allEvents) {
                        if (ev.uid === uid && ev.url) {
                            foundEvent = ev;
                            foundCalUrl = cal.url;
                            break;
                        }
                    }
                    if (foundEvent && foundEvent.url)
                        break;
                }
            }
            catch (fetchErr) {
                return res.status(404).json({ error: "event_not_found", details: "Event not found in cache or iCloud." });
            }
        }
        if (!foundEvent || !foundEvent.url)
            return res.status(404).json({ error: "event_not_found", details: "Event UID not found in cache or iCloud." });
        // Use CalDAV DELETE
        const fetch = (global.fetch || require("node-fetch"));
        const authHeader = session?.appleId && session?.appPassword
            ? {
                Authorization: "Basic " + Buffer.from(session.appleId + ":" + session.appPassword).toString("base64"),
            }
            : {};
        const result = await fetch(foundEvent.url, {
            method: "DELETE",
            headers: {
                ...(authHeader.Authorization ? { Authorization: authHeader.Authorization } : {}),
            },
        });
        if (!result.ok) {
            return res.status(500).json({ error: "delete_failed", status: result.status, details: await result.text() });
        }
        // Remove from cache (if present)
        if (foundCalUrl) {
            const cacheKey = createCacheKey(foundCalUrl);
            const events = await getCachedEvents(cacheKey) || [];
            await setCachedEvents(cacheKey, events.filter((e) => e.uid !== uid));
        }
        return res.json({ ok: true });
    }
    catch (err) {
        let message = 'Unknown error';
        if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
            message = err.message;
        }
        else if (typeof err === 'string') {
            message = err;
        }
        return res.status(500).json({ error: 'Failed to delete iCloud event', details: message });
    }
});
export default router;
