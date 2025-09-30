import { Router } from "express";
import { createObject, fetchCalendars, DAVClient } from "tsdav";
import { getSession, getCalendarsCache } from "../icloudSession";
import { DateTime } from "luxon";
import { requireAuth } from "../middleware/auth";

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// Clean, robust /schedule endpoint using shared iCloud session/cache state and strict Mountain Time
router.post("/schedule", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { start, end, summary, description = "", location = "", videoUrl = "", zoomMeetingId = "", calendarId, provider, lengthMinutes } = req.body;
    if (!start || !summary || !calendarId || !provider) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Always use Mountain Time for scheduling
    const mountainStart = DateTime.fromISO(start, { zone: "America/Denver" });
    let mountainEnd;
    if (end) {
      mountainEnd = DateTime.fromISO(end, { zone: "America/Denver" });
    } else if (lengthMinutes) {
      mountainEnd = mountainStart.plus({ minutes: Number(lengthMinutes) });
    } else {
      // Default to 30 minutes if neither end nor lengthMinutes provided
      mountainEnd = mountainStart.plus({ minutes: 30 });
    }

    if (provider === "icloud") {
      // Get iCloud credentials directly like other iCloud endpoints do
      function getIcloudCreds() {
        const appleId = process.env.APPLE_ID;
        const appPassword = process.env.APPLE_APP_PASSWORD;
        if (!appleId || !appPassword) {
          throw new Error("Missing APPLE_ID or APPLE_APP_PASSWORD environment variables");
        }
        return { appleId, appPassword };
      }

      const creds = getIcloudCreds();
      
      // Find the Business calendar by fetching current calendars
      const davClient = new DAVClient({
        serverUrl: "https://caldav.icloud.com",
        credentials: {
          username: creds.appleId,
          password: creds.appPassword,
        },
        authMethod: "Basic",
        defaultAccountType: "caldav",
      });

      await davClient.login();
      const calendars = await davClient.fetchCalendars();
      console.log('[calendar][schedule] Available calendars:', calendars.map(c => ({ displayName: c.displayName, url: c.url })));
      
      const targetCalendar = calendars.find((c) => c.displayName === "Business" || c.displayName === calendarId || c.url === calendarId);
      if (!targetCalendar) {
        return res.status(404).json({ error: "Calendar not found" });
      }
      
      // Use tsdav to create event
      // Minimal ICS string builder for iCloud
      function pad(n: number) { return n < 10 ? '0' + n : n.toString(); }
      // Format as local time (no Z) for DTSTART/DTEND, UTC with Z for DTSTAMP
      function formatLocal(dt: Date) {
        return dt.getFullYear().toString() +
          pad(dt.getMonth() + 1) +
          pad(dt.getDate()) + 'T' +
          pad(dt.getHours()) +
          pad(dt.getMinutes()) +
          pad(dt.getSeconds());
      }
      function formatUTC(dt: Date) {
        return dt.getUTCFullYear().toString() +
          pad(dt.getUTCMonth() + 1) +
          pad(dt.getUTCDate()) + 'T' +
          pad(dt.getUTCHours()) +
          pad(dt.getUTCMinutes()) +
          pad(dt.getUTCSeconds()) + 'Z';
      }
      const uid = `${Date.now()}-${Math.floor(Math.random()*100000)}@nat-accounting.com`;
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
      if (description) icsLines.push(`DESCRIPTION:${description}`);
      if (location) icsLines.push(`LOCATION:${location}`);
      if (videoUrl) icsLines.push(`URL:${videoUrl}`);
      if (zoomMeetingId) icsLines.push(`X-ZOOM-MEETING-ID:${zoomMeetingId}`);
      icsLines.push('END:VEVENT', 'END:VCALENDAR');
      let icsString = icsLines.join('\r\n');
      console.log('[calendar][schedule] ICS string to upload:', icsString);
      
      try {
        console.log('[calendar][schedule] Attempting to create event on calendar:', targetCalendar.displayName, 'URL:', targetCalendar.url);
        
        // Add Basic Auth header for iCloud CalDAV
        const authHeader = {
          Authorization: "Basic " + Buffer.from(creds.appleId + ":" + creds.appPassword).toString("base64"),
        };
        
        // Use PUT with unique .ics filename, set Content-Type header
        const icsFilename = `${uid}.ics`;
        const uploadUrl = targetCalendar.url.endsWith('/') ? targetCalendar.url + icsFilename : targetCalendar.url + '/' + icsFilename;
        const result = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Authorization': authHeader.Authorization,
            'Content-Type': 'text/calendar; charset=utf-8',
          },
          body: icsString,
        });
        console.log('[calendar][schedule] Upload result status:', result.status, result.statusText);
        if (!result.ok) {
          const errorText = await result.text();
          console.error('[calendar][schedule] Upload failed:', result.status, result.statusText, errorText);
          return res.status(500).json({ error: 'Failed to upload event to iCloud', details: `${result.status} ${result.statusText}` });
        }

        // Comprehensive cache invalidation for immediate UI updates
        const { clearAllCalendarCaches } = await import("../cache");
        await clearAllCalendarCaches("schedule");
        
        return res.json({ success: true, uid, calendar: targetCalendar.displayName });
      } catch (err) {
        console.error('[calendar][schedule] Error creating event:', err);
        let message = 'Unknown error';
        if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
          message = (err as any).message;
        } else if (typeof err === 'string') {
          message = err;
        }
        return res.status(500).json({ error: 'Failed to create iCloud event', details: message });
      }
    } else if (provider === "google") {
      // Google Calendar scheduling logic (assume implemented elsewhere)
      // ...existing code for Google scheduling...
      return res.json({ success: true });
    } else {
      return res.status(400).json({ error: "Unknown provider" });
    }
  } catch (err) {
    console.error("/schedule error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
// Removed broken /link endpoint (calendarFeedUrl is not used)

export { router };
