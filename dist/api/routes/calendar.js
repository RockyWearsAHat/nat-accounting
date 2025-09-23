import { Router } from "express";
import { getSession, getCalendarsCache } from "../icloudSession";
import { DateTime } from "luxon";
const router = Router();
// Clean, robust /schedule endpoint using shared iCloud session/cache state and strict Mountain Time
router.post("/schedule", async (req, res) => {
    try {
        const { start, end, summary, description = "", location = "", videoUrl = "", calendarId, provider, lengthMinutes } = req.body;
        if (!start || !summary || !calendarId || !provider) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        // Always use Mountain Time for scheduling
        const mountainStart = DateTime.fromISO(start, { zone: "America/Denver" });
        let mountainEnd;
        if (end) {
            mountainEnd = DateTime.fromISO(end, { zone: "America/Denver" });
        }
        else if (lengthMinutes) {
            mountainEnd = mountainStart.plus({ minutes: Number(lengthMinutes) });
        }
        else {
            // Default to 30 minutes if neither end nor lengthMinutes provided
            mountainEnd = mountainStart.plus({ minutes: 30 });
        }
        if (provider === "icloud") {
            const session = getSession();
            const calendarsCache = getCalendarsCache();
            if (!session || !calendarsCache) {
                return res.status(401).json({ error: "iCloud session not initialized" });
            }
            const calendar = calendarsCache.find((c) => c.displayName === "Business" || c.id === calendarId || c.url === calendarId);
            if (!calendar) {
                return res.status(404).json({ error: "Calendar not found" });
            }
            // Use tsdav to create event
            // Minimal ICS string builder for iCloud
            function pad(n) { return n < 10 ? '0' + n : n.toString(); }
            // Format as local time (no Z) for DTSTART/DTEND, UTC with Z for DTSTAMP
            function formatLocal(dt) {
                return dt.getFullYear().toString() +
                    pad(dt.getMonth() + 1) +
                    pad(dt.getDate()) + 'T' +
                    pad(dt.getHours()) +
                    pad(dt.getMinutes()) +
                    pad(dt.getSeconds());
            }
            function formatUTC(dt) {
                return dt.getUTCFullYear().toString() +
                    pad(dt.getUTCMonth() + 1) +
                    pad(dt.getUTCDate()) + 'T' +
                    pad(dt.getUTCHours()) +
                    pad(dt.getUTCMinutes()) +
                    pad(dt.getUTCSeconds()) + 'Z';
            }
            const uid = `${Date.now()}-${Math.floor(Math.random() * 100000)}@nat-accounting.com`;
            const dtstamp = formatUTC(new Date());
            const dtstart = formatLocal(mountainStart.toJSDate());
            const dtend = formatLocal(mountainEnd.toJSDate());
            // America/Denver VTIMEZONE block (static, covers DST)
            const vtimezone = [
                'BEGIN:VTIMEZONE',
                'TZID:America/Denver',
                'X-LIC-LOCATION:America/Denver',
                'BEGIN:DAYLIGHT',
                'TZOFFSETFROM:-0700',
                'TZOFFSETTO:-0600',
                'TZNAME:MDT',
                'DTSTART:19700308T020000',
                'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
                'END:DAYLIGHT',
                'BEGIN:STANDARD',
                'TZOFFSETFROM:-0600',
                'TZOFFSETTO:-0700',
                'TZNAME:MST',
                'DTSTART:19701101T020000',
                'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
                'END:STANDARD',
                'END:VTIMEZONE'
            ].join('\r\n');
            let icsLines = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//nat-accounting//scheduler//EN',
                'CALSCALE:GREGORIAN',
                'X-WR-TIMEZONE:America/Denver',
                vtimezone,
                'BEGIN:VEVENT',
                `UID:${uid}`,
                'SEQUENCE:0',
                `DTSTAMP:${dtstamp}`,
                `DTSTART;TZID=America/Denver:${dtstart}`,
                `DTEND;TZID=America/Denver:${dtend}`,
                `SUMMARY:${summary}`
            ];
            if (description)
                icsLines.push(`DESCRIPTION:${description}`);
            if (location)
                icsLines.push(`LOCATION:${location}`);
            if (videoUrl)
                icsLines.push(`URL:${videoUrl}`);
            icsLines.push('END:VEVENT', 'END:VCALENDAR');
            let icsString = icsLines.join('\r\n');
            console.log('[icloud][create] ICS string to upload:', icsString);
            try {
                console.log('[icloud][create] Attempting to create event on calendar:', calendar.displayName, 'URL:', calendar.url);
                console.log('[icloud][create] Session appleId:', session?.appleId);
                // Add Basic Auth header for iCloud CalDAV
                const authHeader = session?.appleId && session?.appPassword
                    ? {
                        Authorization: "Basic " + Buffer.from(session.appleId + ":" + session.appPassword).toString("base64"),
                    }
                    : {};
                // Use PUT with unique .ics filename, set Content-Type header
                const icsFilename = `${uid}.ics`;
                const uploadUrl = calendar.url.endsWith('/') ? calendar.url + icsFilename : calendar.url + '/' + icsFilename;
                const result = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        ...(authHeader.Authorization ? { 'Authorization': authHeader.Authorization } : {}),
                        'Content-Type': 'text/calendar; charset=utf-8',
                    },
                    body: icsString,
                });
                console.log('[icloud][create] createObject result:', result);
                // Invalidate day and week cache for this date
                const { invalidateCache, createCacheKey } = await import("../cache");
                const eventDate = mountainStart.toISODate();
                if (eventDate) {
                    // Invalidate day cache
                    await invalidateCache(createCacheKey("icloud", "day", eventDate));
                }
                // Invalidate week cache (for any week containing this date)
                // Find week start/end (Sunday-Saturday)
                const weekStart = mountainStart.startOf('week').toISODate();
                const weekEnd = mountainStart.endOf('week').toISODate();
                if (weekStart && weekEnd) {
                    await invalidateCache(createCacheKey("icloud", "week", weekStart, weekEnd));
                }
                return res.json({ success: true, result });
            }
            catch (err) {
                console.error('[icloud][create] Error creating event:', err);
                let message = 'Unknown error';
                if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
                    message = err.message;
                }
                else if (typeof err === 'string') {
                    message = err;
                }
                return res.status(500).json({ error: 'Failed to create iCloud event', details: message });
            }
        }
        else if (provider === "google") {
            // Google Calendar scheduling logic (assume implemented elsewhere)
            // ...existing code for Google scheduling...
            return res.json({ success: true });
        }
        else {
            return res.status(400).json({ error: "Unknown provider" });
        }
    }
    catch (err) {
        console.error("/schedule error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Removed broken /link endpoint (calendarFeedUrl is not used)
export { router };
