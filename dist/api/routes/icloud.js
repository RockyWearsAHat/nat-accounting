import { Router } from "express";
import { createDAVClient, fetchCalendars, fetchCalendarObjects } from "tsdav";
import rrulePkg from "rrule";
import { requireAuth } from "../middleware/auth";
const { rrulestr } = rrulePkg;
const eventCache = {};
function createCacheKey(...args) {
    return args.join(":");
}
function getCachedEvents(key) {
    return eventCache[key] || null;
}
function setCachedEvents(key, events) {
    eventCache[key] = events;
}
function requireAdmin(req, res, next) {
    if (req.user?.role !== "admin") {
        return res.status(403).json({ error: "forbidden" });
    }
    next();
}
function getIcloudCreds() {
    return {
        username: process.env.APPLE_ID || "",
        password: process.env.APPLE_APP_PASSWORD || "",
    };
}
function parseICalDate(val) {
    if (val.match(/^[0-9]{8}$/)) {
        return new Date(`${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`);
    }
    if (val.match(/^[0-9]{8}T[0-9]{6}Z?$/)) {
        return new Date(`${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}T${val.slice(9, 11)}:${val.slice(11, 13)}:${val.slice(13, 15)}${val.endsWith('Z') ? 'Z' : ''}`);
    }
    return new Date(val);
}
function parseICalEvents(objects, from, to) {
    const events = [];
    for (const obj of objects) {
        if (!obj?.data || !obj.data.includes('BEGIN:VEVENT'))
            continue;
        const dtstart = obj.data.match(/DTSTART[^:]*:(.+)/);
        const dtend = obj.data.match(/DTEND[^:]*:(.+)/);
        const uid = obj.data.match(/UID:(.+)/)?.[1]?.split('\n')[0].trim() || 'unknown';
        const summary = obj.data.match(/SUMMARY:(.+)/)?.[1]?.split('\n')[0].trim() || '';
        if (!dtstart)
            continue;
        const startDate = parseICalDate(dtstart[1].trim());
        const endDate = dtend ? parseICalDate(dtend[1].trim()) : startDate;
        if (isNaN(startDate.getTime()) || startDate > to || endDate < from)
            continue;
        events.push({
            uid,
            summary,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            isRecurring: false,
            raw: obj.data
        });
    }
    return events;
}
async function fetchAndCacheEvents(from, to, cacheKey) {
    console.log(`[iCloud] Fetching events for ${from.toISOString()} to ${to.toISOString()}`);
    try {
        const creds = getIcloudCreds();
        if (!creds.username || !creds.password) {
            console.error('[iCloud] Missing credentials - APPLE_ID or APPLE_APP_PASSWORD not set');
            return [];
        }
        console.log(`[iCloud] Creating DAV client with username: ${creds.username.slice(0, 3)}***`);
        const client = await createDAVClient({
            serverUrl: "https://caldav.icloud.com",
            credentials: creds,
            authMethod: "Basic",
            defaultAccountType: "caldav",
        });
        console.log('[iCloud] DAV client created, discovering account...');
        // Discover the account URLs first
        const account = await client.createAccount({
            account: {
                serverUrl: "https://caldav.icloud.com",
                accountType: "caldav"
            }
        });
        console.log('[iCloud] Account discovered, fetching calendars...');
        const calendars = await fetchCalendars({ account });
        console.log(`[iCloud] Found ${calendars.length} calendars`);
        let allEvents = [];
        for (const calendar of calendars) {
            try {
                console.log(`[iCloud] Fetching events from calendar: ${calendar.displayName}`);
                const objects = await fetchCalendarObjects({
                    calendar,
                    timeRange: { start: from.toISOString(), end: to.toISOString() },
                    expand: false
                });
                console.log(`[iCloud] Found ${objects.length} calendar objects in ${calendar.displayName}`);
                const events = parseICalEvents(objects, from, to).map(event => ({
                    ...event,
                    calendar: calendar.displayName,
                    calendarUrl: calendar.url,
                    calendarId: calendar.url,
                    calendarSource: 'icloud',
                    blocking: true,
                    color: '#007AFF'
                }));
                console.log(`[iCloud] Parsed ${events.length} events from ${calendar.displayName}`);
                allEvents.push(...events);
            }
            catch (calErr) {
                console.error(`[iCloud] Error fetching from calendar ${calendar.displayName}:`, calErr);
                continue;
            }
        }
        allEvents.sort((a, b) => a.start.localeCompare(b.start));
        setCachedEvents(cacheKey, allEvents);
        console.log(`[iCloud] Total events fetched and cached: ${allEvents.length}`);
        return allEvents;
    }
    catch (error) {
        console.error('[iCloud] Major fetch error:', error);
        return [];
    }
}
const router = Router();
// Apply authentication to all routes
router.use(requireAuth);
// GET /api/icloud/config - Return calendar configuration
router.get("/config", requireAdmin, async (req, res) => {
    try {
        const client = await createDAVClient({
            serverUrl: "https://caldav.icloud.com",
            credentials: getIcloudCreds(),
            authMethod: "Basic",
            defaultAccountType: "caldav",
        });
        const account = await client.createAccount({
            account: {
                serverUrl: "https://caldav.icloud.com",
                accountType: "caldav"
            }
        });
        const calendars = await fetchCalendars({ account });
        const calendarData = calendars.map(cal => ({
            displayName: cal.displayName,
            url: cal.url,
            id: cal.url,
            busy: true, // Default to busy for now
            color: '#007AFF' // Default iCloud blue
        }));
        res.json({
            calendars: calendarData,
            whitelist: [], // Empty for now
            busyEvents: [], // Empty for now  
            colors: {} // Empty for now
        });
    }
    catch (error) {
        console.error('iCloud config error:', error);
        res.status(500).json({ error: "Failed to fetch iCloud configuration" });
    }
});
// POST /api/icloud/config - Update calendar configuration  
router.post("/config", requireAdmin, async (req, res) => {
    try {
        const { busy = [], colors = {} } = req.body;
        // For now, just echo back what was sent since we don't have persistent storage
        // In production, this would save to database
        const client = await createDAVClient({
            serverUrl: "https://caldav.icloud.com",
            credentials: getIcloudCreds(),
            authMethod: "Basic",
            defaultAccountType: "caldav",
        });
        const account = await client.createAccount({
            account: {
                serverUrl: "https://caldav.icloud.com",
                accountType: "caldav"
            }
        });
        const calendars = await fetchCalendars({ account });
        const calendarData = calendars.map(cal => ({
            displayName: cal.displayName,
            url: cal.url,
            id: cal.url,
            busy: busy.includes(cal.url),
            color: colors[cal.url] || '#007AFF'
        }));
        res.json({
            calendars: calendarData,
            whitelist: [],
            busyEvents: [],
            colors
        });
    }
    catch (error) {
        console.error('iCloud config update error:', error);
        res.status(500).json({ error: "Failed to update iCloud configuration" });
    }
});
// GET /api/icloud/status - Check iCloud connection status
router.get("/status", requireAdmin, async (req, res) => {
    try {
        const creds = getIcloudCreds();
        if (!creds.username || !creds.password) {
            return res.json({
                connected: false,
                error: "Missing credentials",
                hasUsername: !!creds.username,
                hasPassword: !!creds.password
            });
        }
        // Try a quick connection test
        const client = await createDAVClient({
            serverUrl: "https://caldav.icloud.com",
            credentials: creds,
            authMethod: "Basic",
            defaultAccountType: "caldav",
        });
        const account = await client.createAccount({
            account: {
                serverUrl: "https://caldav.icloud.com",
                accountType: "caldav"
            }
        });
        const calendars = await fetchCalendars({ account });
        res.json({
            connected: true,
            calendarsFound: calendars.length,
            calendars: calendars.map(cal => ({ name: cal.displayName, url: cal.url }))
        });
    }
    catch (error) {
        console.error('[iCloud] Status check error:', error);
        res.json({
            connected: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get("/week", requireAdmin, async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) {
        return res.status(400).json({ error: "start_and_end_required" });
    }
    const from = new Date(start);
    const to = new Date(end);
    const cacheKey = createCacheKey("icloud", "week", start, end);
    const cached = getCachedEvents(cacheKey);
    if (cached) {
        res.json({ events: cached, cached: true });
        fetchAndCacheEvents(from, to, cacheKey).catch(() => { });
        return;
    }
    const events = await fetchAndCacheEvents(from, to, cacheKey);
    res.json({ events, cached: false });
});
router.get("/day", requireAdmin, async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ error: "date_required" });
    }
    const from = new Date(date);
    const to = new Date(from.getTime() + 86400000);
    const cacheKey = createCacheKey("icloud", "day", date);
    const cached = getCachedEvents(cacheKey);
    if (cached) {
        res.json({ events: cached, cached: true });
        fetchAndCacheEvents(from, to, cacheKey).catch(() => { });
        return;
    }
    const events = await fetchAndCacheEvents(from, to, cacheKey);
    res.json({ events, cached: false });
});
router.get("/month", requireAdmin, async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) {
        return res.status(400).json({ error: "year_and_month_required" });
    }
    const from = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const to = new Date(Date.UTC(Number(year), Number(month), 1));
    const cacheKey = createCacheKey("icloud", "month", year, month);
    const cached = getCachedEvents(cacheKey);
    if (cached) {
        res.json({ events: cached, cached: true });
        fetchAndCacheEvents(from, to, cacheKey).catch(() => { });
        return;
    }
    const events = await fetchAndCacheEvents(from, to, cacheKey);
    res.json({ events, cached: false });
});
router.get("/all", requireAdmin, async (req, res) => {
    const from = new Date();
    const to = new Date(Date.now() + 90 * 86400000);
    const cacheKey = createCacheKey("icloud", "all", from.toISOString(), to.toISOString());
    const cached = getCachedEvents(cacheKey);
    if (cached) {
        res.json({ events: cached, cached: true });
        fetchAndCacheEvents(from, to, cacheKey).catch(() => { });
        return;
    }
    const events = await fetchAndCacheEvents(from, to, cacheKey);
    res.json({ events, cached: false });
});
export { router };
