

// Delete event by UID (admin only)
// (Moved after router declaration)


import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { connect as connectMongo, CalendarConfigModel } from "../mongo.js";
import {
  getCachedEvents,
  setCachedEvents,
  createCacheKey,
  invalidateCache,
} from "../cache.js";
import { getSession, setSession, getCalendarsCache, setCalendarsCache } from "../icloudSession.js";
// CalDAV (iCloud) via dav library. NOTE: Do NOT store credentials plaintext in production.
// Use an app-specific password generated in Apple ID (Security > App-Specific Passwords).
// 2FA Apple logins cannot be fully automated with normal password.
// This is a demo-only minimal integration.
// @ts-ignore - library lacks bundled types
import { createDAVClient } from "tsdav";
import { google } from "googleapis";
import { User } from "../models/User.js";
// Using a lightweight custom ICS parser (handles folding + simple RRULE expansion)

// Config: calendars considered for conflict & whitelisted / forced busy event UIDs
const busyCalendarUrls = new Set<string>(); // if empty we'll treat ALL calendars as busy by default until user sets
const whitelistUIDs = new Set<string>(); // events here NEVER block
const busyEventUIDs = new Set<string>(); // events here ALWAYS block (unless whitelisted)
const calendarColors: Record<string, string> = {}; // calendar url -> color hex
let configLoaded = false; // persistence flag

async function loadPersistedConfigIfNeeded() {
  if (configLoaded) return;
  await connectMongo();
  try {
    console.log("[icloud] Loading persisted config...");
    const doc = await CalendarConfigModel.findOne();
    if (doc) {
      busyCalendarUrls.clear();
      doc.busyCalendars.forEach((u: string) => busyCalendarUrls.add(u));
      whitelistUIDs.clear();
      doc.whitelistUIDs.forEach((u: string) => whitelistUIDs.add(u));
      busyEventUIDs.clear();
      doc.busyEventUIDs.forEach((u: string) => busyEventUIDs.add(u));
      Object.assign(calendarColors, doc.get("calendarColors") || {});
      console.log(
        "[icloud] Config loaded - busy calendars:",
        Array.from(busyCalendarUrls).length
      );
    } else {
      console.log("[icloud] No persisted config found, will use defaults");
    }
  } catch (e) {
    console.warn("[icloud] load persisted config failed", e);
  } finally {
    configLoaded = true;
  }
}

async function persistConfig() {
  await connectMongo();
  try {
    const doc = await CalendarConfigModel.findOne();
    if (doc) {
      doc.busyCalendars = Array.from(busyCalendarUrls);
      doc.whitelistUIDs = Array.from(whitelistUIDs);
      doc.busyEventUIDs = Array.from(busyEventUIDs);
      doc.set("calendarColors", calendarColors);
      doc.updatedAt = new Date();
      await doc.save();
    } else {
      await CalendarConfigModel.create({
        busyCalendars: Array.from(busyCalendarUrls),
        whitelistUIDs: Array.from(whitelistUIDs),
        busyEventUIDs: Array.from(busyEventUIDs),
        calendarColors,
      });
    }
  } catch (e) {
    console.warn("[icloud] persist config failed", e);
  }
}

const router = Router();
router.use(requireAuth); // all iCloud routes require authenticated user (admin enforced below)

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin")
    return res.status(403).json({ error: "forbidden" });
  next();
}

async function initFromEnvIfPossible() {
  const session = getSession();
  if (session) return;
  const appleId = process.env.APPLE_ID;
  const appPassword = process.env.APPLE_APP_PASSWORD;
  if (!appleId || !appPassword) {
    console.log(
      "[icloud] No Apple ID or app password in env, calendar features disabled"
    );
    return;
  }
  try {
    console.log("[icloud] Initializing session from environment variables...");
    setSession({ appleId, appPassword });
    const client = await createDAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: { username: appleId, password: appPassword },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });
    const calendars = await client.fetchCalendars();
    setCalendarsCache(calendars.map((c: any) => ({
      displayName: c.displayName,
      url: c.url,
      raw: c,
    })));

    // Load persisted config before setting defaults
    await loadPersistedConfigIfNeeded();

    // Initialize busy set on first connect only if empty
    const calendarsCache = getCalendarsCache();
    if (busyCalendarUrls.size === 0 && calendarsCache) {
      calendarsCache.forEach((c) => busyCalendarUrls.add(c.url));
      console.log(
        "[icloud] No busy calendars configured, marking all as busy by default"
      );
    }

    console.log(
      "[icloud] Session initialized from env; calendars:",
      calendarsCache ? calendarsCache.map((c) => c.displayName).join(", ") : "none"
    );
  } catch (e) {
    console.warn("[icloud] Auto-init from env failed", e);
    setSession(null);
  }
}


// iCloud connect endpoint (admin only)
router.post("/connect", requireAdmin, async (req, res) => {
  const { appleId, appPassword } = req.body || {};
  if (!appleId || !appPassword)
    return res.status(400).json({ error: "appleId_and_appPassword_required" });
  setSession({ appleId, appPassword });
  try {
    const client = await createDAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: { username: appleId, password: appPassword },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });
    const calendars = await client.fetchCalendars();
    setCalendarsCache(calendars.map((c: any) => ({
      displayName: c.displayName,
      url: c.url,
      raw: c,
    })));
    // Initialize busy set on first connect only if empty
    const calendarsCache = getCalendarsCache();
    if (busyCalendarUrls.size === 0 && calendarsCache)
      calendarsCache.forEach((c) => busyCalendarUrls.add(c.url));
    res.json({ ok: true, calendars: calendarsCache });
  } catch (e: any) {
    console.error("iCloud connect error", e);
    res.status(500).json({ error: "icloud_connect_failed" });
  }
});

// Set selected calendarHref for session (admin only)
router.post("/select-calendar", requireAdmin, async (req, res) => {
  const session = getSession();
  if (!session) return res.status(400).json({ error: "not_connected" });
  const { calendarHref } = req.body || {};
  if (!calendarHref)
    return res.status(400).json({ error: "calendarHref_required" });
  session.calendarHref = calendarHref;
  setSession(session);
  res.json({ ok: true });
});

// Get / update config
router.get("/config", requireAdmin, async (req, res) => {
  await loadPersistedConfigIfNeeded();
  let session = getSession();
  if (!session) await initFromEnvIfPossible();
  session = getSession();
  const calendarsCache = getCalendarsCache() || [];

  console.log("[icloud] Config request - session exists:", !!session);
  console.log("[icloud] Calendars cache:", calendarsCache.length);
  console.log("[icloud] Busy calendars:", Array.from(busyCalendarUrls).length);

  const list = calendarsCache.map((c) => ({
    displayName: c.displayName,
    url: c.url,
    busy: busyCalendarUrls.has(c.url),
  }));

  // Append Google calendars (if connected) for unified configuration
  try {
    const user = await User.findById((req as any).user?.id);
    if (user?.googleTokens?.refreshToken) {
      // Ensure any legacy persisted accessToken field is removed
      if ((user as any).googleTokens && (user as any).googleTokens.accessToken) {
        delete (user as any).googleTokens.accessToken;
        await user.save().catch(()=>{});
      }
      const gClient = buildGoogleClient();
      gClient.setCredentials({
        refresh_token: user.googleTokens.refreshToken,
        // Access token omitted intentionally; googleapis library will fetch using refresh token
      });
      const cal = google.calendar({ version: "v3", auth: gClient });
      const gList = await cal.calendarList.list({ maxResults: 250 });
      for (const c of gList.data.items || []) {
        const url = `google://${c.id}`;
        list.push({
          displayName: c.summary || c.id || "Google Calendar",
          url,
          busy: busyCalendarUrls.has(url) || busyCalendarUrls.size === 0, // follow initial default logic
        });
      }
    }
  } catch (e) {
    console.warn("[unified-config] google calendars fetch failed", (e as any)?.message || e);
  }
  res.json({
    calendars: list,
    whitelist: Array.from(whitelistUIDs),
    busyEvents: Array.from(busyEventUIDs),
    colors: calendarColors,
  });
});
router.post("/config", requireAdmin, async (req, res) => {
  const { busy, colors } = req.body || {};
  if (Array.isArray(busy)) {
    busyCalendarUrls.clear();
    busy.forEach((u: string) => busyCalendarUrls.add(u));
  }
  if (colors && typeof colors === "object") {
    for (const [url, color] of Object.entries(colors)) {
      if (typeof color === "string" && /^(#?[0-9a-fA-F]{3,8})$/.test(color)) {
        calendarColors[url] = color.startsWith("#") ? color : "#" + color;
      }
    }
  }
  const calendarsCache = getCalendarsCache() || [];
  const list = calendarsCache.map((c) => ({
    displayName: c.displayName,
    url: c.url,
    busy: busyCalendarUrls.has(c.url),
  }));
  // Append Google calendars for unified config just like GET
  try {
    const user = await User.findById((req as any).user?.id);
    if (user?.googleTokens?.refreshToken) {
      const gClient = buildGoogleClient();
      gClient.setCredentials({
        refresh_token: user.googleTokens.refreshToken, // refresh-only; access token fetched on demand
      });
      const cal = google.calendar({ version: "v3", auth: gClient });
      const gList = await cal.calendarList.list({ maxResults: 250 });
      for (const c of gList.data.items || []) {
        const url = `google://${c.id}`;
        list.push({
          displayName: c.summary || c.id || "Google Calendar",
          url,
          busy: busyCalendarUrls.has(url) || busyCalendarUrls.size === 0,
        });
      }
    }
  } catch (e) {
    console.warn("[unified-config:post] google calendars fetch failed", (e as any)?.message || e);
  }
  await persistConfig();
  res.json({ ok: true, calendars: list, colors: calendarColors });
});
router.post("/whitelist", requireAdmin, async (req, res) => {
  const { uid, action } = req.body || {};
  if (!uid || !action)
    return res.status(400).json({ error: "uid_and_action_required" });
  if (action === "add") whitelistUIDs.add(uid);
  else if (action === "remove") whitelistUIDs.delete(uid);
  else return res.status(400).json({ error: "invalid_action" });
  await persistConfig();
  res.json({
    ok: true,
    whitelist: Array.from(whitelistUIDs),
    busyEvents: Array.from(busyEventUIDs),
  });
});

router.post("/event-busy", requireAdmin, async (req, res) => {
  const { uid, action } = req.body || {};
  if (!uid || !action)
    return res.status(400).json({ error: "uid_and_action_required" });
  if (action === "add") busyEventUIDs.add(uid);
  else if (action === "remove") busyEventUIDs.delete(uid);
  else return res.status(400).json({ error: "invalid_action" });
  await persistConfig();
  res.json({
    ok: true,
    busyEvents: Array.from(busyEventUIDs),
    whitelist: Array.from(whitelistUIDs),
  });
});

router.get("/today", requireAdmin, async (_req, res) => {
  let session = getSession();
  if (!session) await initFromEnvIfPossible();
  session = getSession();
  if (!session) return res.status(400).json({ error: "not_connected" });
  if (!session.calendarHref)
    return res.status(400).json({ error: "no_calendar_selected" });
  try {
    const { appleId, appPassword, calendarHref } = session;
    const client = await createDAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: { username: appleId, password: appPassword },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });
    const objects = await client.fetchCalendarObjects({
      calendar: { url: calendarHref } as any,
    });
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const events = collectEventsFromObjects(objects, dayStart, dayEnd).map(
      (e) => addBlocking(e)
    );
    res.json({ events });
  } catch (e: any) {
    console.error("iCloud fetch error", e);
    res.status(500).json({ error: "icloud_fetch_failed" });
  }
});

// Aggregate events across all calendars for the next N days (default 7)
// Month endpoint (year, month 1-12)
router.get("/month", requireAdmin, async (req, res) => {
  let session = getSession();
  if (!session) await initFromEnvIfPossible();
  session = getSession();
  if (!session) return res.status(400).json({ error: "not_connected" });
  const calendarsCache = getCalendarsCache() || [];
  const year = parseInt(String(req.query.year), 10);
  const month = parseInt(String(req.query.month), 10); // 1-12
  if (!year || !month || month < 1 || month > 12)
    return res.status(400).json({ error: "invalid_year_month" });
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const debug = req.query.debug === "1";
  try {
    const { appleId, appPassword } = session;
    const client = await createDAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: { username: appleId, password: appPassword },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });
    const calendars = calendarsCache.length ? calendarsCache : [];
    const allEvents: any[] = [];
    const debugInfo: any[] = [];
    for (const cal of calendars) {
      try {
        const calendarObj = cal.raw || { url: cal.url };
        const objects = await client.fetchCalendarObjects({
          calendar: calendarObj,
          timeRange: { start: from.toISOString(), end: to.toISOString() },
          expand: false,
        });
        if (debug)
          debugInfo.push({
            calendar: cal.displayName,
            objectCount: (objects || []).length,
          });
        const eventsRaw = collectEventsFromObjects(objects, from, to)
          .map((ev) => ({
            ...ev,
            calendar: cal.displayName,
            calendarUrl: cal.url,
          }))
          .map((ev) => addBlocking(ev));
        // Hide events whose calendar isn't marked busy AND event isn't forced busy
        const events = eventsRaw.filter((ev) => {
          if (busyCalendarUrls.has(cal.url)) return true; // busy calendar -> show
          if (ev.uid && busyEventUIDs.has(ev.uid)) return true; // forced busy -> show
          return false; // hide otherwise
        });
        allEvents.push(...events);
      } catch (e: any) {
        console.warn(
          "Calendar fetch failed for",
          cal.url,
          (e && e.message) || e
        );
        if (debug)
          debugInfo.push({
            calendar: cal.displayName,
            error: (e && e.message) || String(e),
          });
      }
    }
    allEvents.sort((a, b) => a.start.localeCompare(b.start));
    res.json({
      range: { start: from.toISOString(), end: to.toISOString() },
      events: allEvents,
      debug: debug ? debugInfo : undefined,
    });
  } catch (e: any) {
    console.error("iCloud month fetch error", e);
    res.status(500).json({ error: "icloud_month_failed" });
  }
});

// Week endpoint (start and end dates in YYYY-MM-DD format)
router.get("/week", requireAdmin, async (req, res) => {
  let session = getSession();
  if (!session) await initFromEnvIfPossible();
  session = getSession();
  if (!session) return res.status(400).json({ error: "not_connected" });
  const calendarsCache = getCalendarsCache() || [];

  const startStr = String(req.query.start || "").trim();
  const endStr = String(req.query.end || "").trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startStr) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endStr)
  ) {
    return res.status(400).json({ error: "invalid_start_or_end_date" });
  }

  const [sy, sm, sd] = startStr.split("-").map((n) => parseInt(n, 10));
  const [ey, em, ed] = endStr.split("-").map((n) => parseInt(n, 10));

  const from = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
  const to = new Date(ey, em - 1, ed, 23, 59, 59, 999);

  const debug = req.query.debug === "1";

  console.log(`[icloud] Week request: ${startStr} to ${endStr}`);
  console.log(`[icloud] Session active:`, !!session);
  console.log(`[icloud] Available calendars:`, calendarsCache.length);

  // Check cache first
  const cacheKey = createCacheKey("icloud", "week", startStr, endStr);
  const cachedEvents = await getCachedEvents(cacheKey);
  if (cachedEvents) {
    console.log(
      `[icloud] Returning cached week events: ${cachedEvents.length}`
    );
    return res.json({
      range: { start: from.toISOString(), end: to.toISOString() },
      events: cachedEvents,
      debug: debug ? { cached: true } : undefined,
      cached: true,
    });
  }

  try {
    const { appleId, appPassword } = session;
    const client = await createDAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: { username: appleId, password: appPassword },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });

    const calendars = calendarsCache.length ? calendarsCache : [];
    const allEvents: any[] = [];
    const debugInfo: any[] = [];

    console.log(`[icloud] Processing ${calendars.length} calendars...`);

    for (const cal of calendars) {
      try {
        console.log(
          `[icloud] Fetching events from calendar: ${cal.displayName}`
        );
        const calendarObj = cal.raw || { url: cal.url };
        const objects = await client.fetchCalendarObjects({
          calendar: calendarObj,
          timeRange: { start: from.toISOString(), end: to.toISOString() },
          expand: false,
        });

        console.log(
          `[icloud] Calendar ${cal.displayName}: ${
            (objects || []).length
          } objects`
        );

        if (debug) {
          debugInfo.push({
            calendar: cal.displayName,
            objectCount: (objects || []).length,
          });
        }

        const eventsRaw = collectEventsFromObjects(objects, from, to)
          .map((ev) => ({
            ...ev,
            calendar: cal.displayName,
            calendarUrl: cal.url,
          }))
          .map((ev) => addBlocking(ev));

        console.log(
          `[icloud] Calendar ${cal.displayName}: ${eventsRaw.length} events after processing`
        );

        // Apply filtering like in month endpoint
        const events = eventsRaw.filter((ev) => {
          if (busyCalendarUrls.has(cal.url)) return true; // busy calendar -> show
          if (ev.uid && busyEventUIDs.has(ev.uid)) return true; // forced busy -> show
          return false; // hide otherwise
        });

        console.log(
          `[icloud] Calendar ${cal.displayName}: ${events.length} events after filtering`
        );

        allEvents.push(...events);
      } catch (e: any) {
        console.warn("Week fetch failed for", cal.url, e?.message || e);
        if (debug) {
          debugInfo.push({
            calendar: cal.displayName,
            error: e?.message || String(e),
          });
        }
      }
    }

    allEvents.sort((a, b) => a.start.localeCompare(b.start));

    console.log(`[icloud] Week response: ${allEvents.length} total events`);

    // Cache the results for 5 minutes
    await setCachedEvents(cacheKey, allEvents, 300);

    res.json({
      range: { start: from.toISOString(), end: to.toISOString() },
      events: allEvents,
      debug: debug ? debugInfo : undefined,
      cached: false,
    });
  } catch (e: any) {
    console.error("iCloud week fetch error", e);
    res.status(500).json({ error: "icloud_week_failed" });
  }
});

// Day view (include ALL events; do not hide non-busy calendar events so they can be forced busy)
router.get("/day", requireAdmin, async (req, res) => {
  let session = getSession();
  if (!session) await initFromEnvIfPossible();
  session = getSession();
  if (!session) return res.status(400).json({ error: "not_connected" });
  const calendarsCache = getCalendarsCache() || [];
  const dateStr = String(req.query.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
    return res.status(400).json({ error: "invalid_date" });

  // Check cache first
  const cacheKey = createCacheKey("icloud", "day", dateStr);
  const cachedEvents = await getCachedEvents(cacheKey);
  if (cachedEvents) {
    console.log(`[icloud] Returning cached day events: ${cachedEvents.length}`);
    return res.json({
      date: dateStr,
      events: cachedEvents,
      cached: true,
    });
  }

  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const from = new Date(y, m - 1, d, 0, 0, 0, 0);
  const to = new Date(from.getTime() + 86400000);
  try {
    const { appleId, appPassword } = session;
    const client = await createDAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: { username: appleId, password: appPassword },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });
    const calendars = calendarsCache.length ? calendarsCache : [];
    const allEvents: any[] = [];

    console.log(
      `[icloud] Fetching day events for ${dateStr} from ${calendars.length} calendars...`
    );

    for (const cal of calendars) {
      try {
        const calendarObj = cal.raw || { url: cal.url };
        const objects = await client.fetchCalendarObjects({
          calendar: calendarObj,
          timeRange: { start: from.toISOString(), end: to.toISOString() },
          expand: false,
        });
        const eventsRaw = collectEventsFromObjects(objects, from, to)
          .map((ev) => ({
            ...ev,
            calendar: cal.displayName,
            calendarUrl: cal.url,
          }))
          .map((ev) => addBlocking(ev));
        // Do NOT filter here; include non-busy calendar events so user can force busy.
        allEvents.push(...eventsRaw);
        console.log(
          `[icloud] Calendar ${cal.displayName}: ${eventsRaw.length} events`
        );
      } catch (e: any) {
        console.warn("Day fetch failed for", cal.url, e?.message || e);
      }
    }
    allEvents.sort((a, b) => a.start.localeCompare(b.start));

    // Cache the results for 5 minutes
    await setCachedEvents(cacheKey, allEvents, 300);

    console.log(
      `[icloud] Day response: ${allEvents.length} total events (cached)`
    );

    res.json({
      date: dateStr,
      events: allEvents,
      cached: false,
    });
  } catch (e: any) {
    console.error("iCloud day fetch error", e);
    res.status(500).json({ error: "icloud_day_failed" });
  }
});

// Aggregate events across all calendars for the next N days (default 7)
router.get("/all", requireAdmin, async (req, res) => {
  let session = getSession();
  if (!session) await initFromEnvIfPossible();
  session = getSession();
  if (!session) return res.status(400).json({ error: "not_connected" });
  const calendarsCache = getCalendarsCache() || [];
  const days = Math.min(31, parseInt(String(req.query.days || "7"), 10) || 7);
  const blockingOnly = req.query.blockingOnly === "1";
  const debug = req.query.debug === "1";

  // Check cache first
  const cacheKey = createCacheKey(
    "icloud",
    "all",
    days.toString(),
    blockingOnly ? "blocking" : "all"
  );
  const cachedEvents = await getCachedEvents(cacheKey);
  if (cachedEvents) {
    const startWindow = new Date();
    startWindow.setHours(0, 0, 0, 0);
    const endWindow = new Date(startWindow.getTime() + days * 86400000);
    console.log(`[icloud] Returning cached all events: ${cachedEvents.length}`);
    return res.json({
      range: { start: startWindow.toISOString(), end: endWindow.toISOString() },
      events: cachedEvents,
      debug: debug ? { cached: true } : undefined,
      cached: true,
    });
  }

  const startWindow = new Date();
  startWindow.setHours(0, 0, 0, 0);
  const endWindow = new Date(startWindow.getTime() + days * 86400000);

  try {
    const { appleId, appPassword } = session;
    const client = await createDAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: { username: appleId, password: appPassword },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });
    const calendars = calendarsCache.length ? calendarsCache : [];
    const allEvents: any[] = [];
    const debugInfo: any[] = [];

    console.log(
      `[icloud] Fetching all events for ${days} days from ${calendars.length} calendars...`
    );

    for (const cal of calendars) {
      try {
        const calendarObj = cal.raw || { url: cal.url };
        const objects = await client.fetchCalendarObjects({
          calendar: calendarObj,
          timeRange: {
            start: startWindow.toISOString(),
            end: endWindow.toISOString(),
          },
          expand: false,
        });
        if (debug)
          debugInfo.push({
            calendar: cal.displayName,
            objectCount: (objects || []).length,
          });
        const eventsRaw = collectEventsFromObjects(
          objects,
          startWindow,
          endWindow
        )
          .map((ev) => ({
            ...ev,
            calendar: cal.displayName,
            calendarUrl: cal.url,
          }))
          .map((ev) => addBlocking(ev));
        const events = eventsRaw.filter((ev) => {
          if (busyCalendarUrls.has(cal.url)) return true;
          if (ev.uid && busyEventUIDs.has(ev.uid)) return true;
          return false;
        });
        allEvents.push(...events);
        console.log(
          `[icloud] Calendar ${cal.displayName}: ${events.length} events after filtering`
        );
      } catch (e: any) {
        console.warn(
          "Calendar fetch failed for",
          cal.url,
          (e && (e as any).message) || e
        );
        if (debug)
          debugInfo.push({
            calendar: cal.displayName,
            error: (e && e.message) || String(e),
          });
      }
    }
    let events = allEvents;
    if (blockingOnly) events = events.filter((e) => e.blocking);
    events.sort((a, b) => a.start.localeCompare(b.start));

    // Cache the results for 5 minutes
    await setCachedEvents(cacheKey, events, 300);

    console.log(
      `[icloud] All response: ${events.length} total events (cached)`
    );

    res.json({
      range: { start: startWindow.toISOString(), end: endWindow.toISOString() },
      events,
      debug: debug ? debugInfo : undefined,
      cached: false,
    });
  } catch (e: any) {
    console.error("iCloud aggregate fetch error", e);
    res.status(500).json({ error: "icloud_aggregate_failed" });
  }
});

interface RawEvent {
  summary: string;
  start: Date;
  end?: Date;
  rrule?: string;
  exdates: Date[];
  uid?: string;
}

function collectEventsFromObjects(
  objects: any[],
  windowStart: Date,
  windowEnd: Date
) {
  const events: {
    summary: string;
    start: string;
    end?: string;
    uid?: string;
  }[] = [];
  for (const obj of objects || []) {
    if (typeof obj.data !== "string" || !obj.data.includes("BEGIN:VEVENT"))
      continue;
    const rawEvents = parseICSEvents(obj.data);
    for (const ev of rawEvents) {
      if (ev.rrule) {
        const occs = expandRecurring(ev, windowStart, windowEnd);
        for (const occ of occs) {
          if (occ.start < windowEnd && (occ.end || occ.start) >= windowStart) {
            events.push({
              summary: ev.summary || "(No Title)",
              start: occ.start.toISOString(),
              end: occ.end?.toISOString(),
              uid: ev.uid,
            });
          }
        }
      } else {
        if (ev.start < windowEnd && (ev.end || ev.start) >= windowStart) {
          events.push({
            summary: ev.summary || "(No Title)",
            start: ev.start.toISOString(),
            end: ev.end?.toISOString(),
            uid: ev.uid,
          });
        }
      }
    }
  }
  return events;
}

function parseICSEvents(raw: string): RawEvent[] {
  // Unfold lines (RFC5545: lines starting with space are continuations)
  const unfolded = raw.replace(/\r?\n[ \t]/g, (match) => "");
  const lines = unfolded.split(/\r?\n/);
  const out: RawEvent[] = [];
  let cur: any = null;
  let inEvent = false;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      cur = { exdates: [] };
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur?.DTSTART) {
        out.push(normalizeRawEvent(cur));
      }
      inEvent = false;
      cur = null;
      continue;
    }
    if (!inEvent || !cur) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const namePart = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const key = namePart.split(";")[0];
    if (key === "EXDATE") {
      value.split(",").forEach((v) => cur.exdates.push(parseDate(v)));
    } else {
      cur[key] = value;
    }
  }
  return out;
}

function normalizeRawEvent(cur: any): RawEvent {
  const start = parseDate(cur.DTSTART);
  let end: Date | undefined = cur.DTEND ? parseDate(cur.DTEND) : undefined;
  if (!end && cur.DURATION) {
    // Basic PTnHnMnS support
    const m = cur.DURATION.match(/P(?:T)?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (m) {
      const h = +m[1] || 0;
      const mi = +m[2] || 0;
      const s = +m[3] || 0;
      end = new Date(start.getTime() + (h * 3600 + mi * 60 + s) * 1000);
    }
  }
  return {
    summary: cur.SUMMARY || "(No Title)",
    start,
    end,
    rrule: cur.RRULE,
    exdates: cur.exdates || [],
    uid: cur.UID,
  };
}

function expandRecurring(ev: RawEvent, windowStart: Date, windowEnd: Date) {
  const results: { start: Date; end?: Date }[] = [];
  if (!ev.rrule) return results;
  const parts = Object.fromEntries(
    ev.rrule.split(";").map((p) => {
      const [k, v] = p.split("=");
      return [k.toUpperCase(), v];
    })
  );
  const freq = parts.FREQ;
  const interval = parseInt(parts.INTERVAL || "1", 10);
  const until = parts.UNTIL ? parseDate(parts.UNTIL) : null;
  const count = parts.COUNT ? parseInt(parts.COUNT, 10) : null;
  const byday = parts.BYDAY ? parts.BYDAY.split(",") : null;
  let occurrence = 0;
  let cursor = new Date(ev.start.getTime());
  const maxEnd = until && until < windowEnd ? until : windowEnd;
  const addOcc = (d: Date) => {
    if (count && occurrence >= count) return;
    if (d < maxEnd && d >= windowStart) {
      if (!ev.exdates.some((x) => x.getTime() === d.getTime())) {
        occurrence++;
        results.push({
          start: new Date(d),
          end: ev.end
            ? new Date(d.getTime() + (ev.end.getTime() - ev.start.getTime()))
            : undefined,
        });
      }
    } else if (d >= maxEnd) {
      return;
    }
  };
  if (freq === "DAILY") {
    while (cursor < maxEnd && (!count || occurrence < count)) {
      addOcc(cursor);
      cursor = new Date(cursor.getTime() + interval * 86400000);
    }
  } else if (freq === "WEEKLY") {
    // Generate weeks; within each week apply BYDAY or the start's weekday
    const weekdayMap: Record<string, number> = {
      SU: 0,
      MO: 1,
      TU: 2,
      WE: 3,
      TH: 4,
      FR: 5,
      SA: 6,
    };
    const baseStart = new Date(ev.start.getTime());
    // align to week start (Sunday)
    const week0 = new Date(baseStart);
    week0.setDate(week0.getDate() - week0.getDay());
    let weekCursor = week0;
    while (weekCursor < maxEnd && (!count || occurrence < count)) {
      const days =
        byday && byday.length
          ? byday
          : [["SU", "MO", "TU", "WE", "TH", "FR", "SA"][baseStart.getDay()]];
      for (const dcode of days) {
        const dayOffset = weekdayMap[dcode];
        if (dayOffset == null) continue;
        const occ = new Date(weekCursor);
        occ.setDate(weekCursor.getDate() + dayOffset);
        occ.setHours(
          baseStart.getHours(),
          baseStart.getMinutes(),
          baseStart.getSeconds(),
          baseStart.getMilliseconds()
        );
        if (occ < ev.start) continue; // skip before original DTSTART
        addOcc(occ);
        if (count && occurrence >= count) break;
      }
      weekCursor = new Date(weekCursor.getTime() + interval * 7 * 86400000);
    }
  } else if (freq === "MONTHLY") {
    while (cursor < maxEnd && (!count || occurrence < count)) {
      addOcc(cursor);
      const m = cursor.getMonth();
      cursor = new Date(cursor);
      cursor.setMonth(m + interval);
    }
  } else if (freq === "YEARLY") {
    while (cursor < maxEnd && (!count || occurrence < count)) {
      addOcc(cursor);
      const y = cursor.getFullYear();
      cursor = new Date(cursor);
      cursor.setFullYear(y + interval);
    }
  }
  return results;
}

function addBlocking(ev: any) {
  const calendarUrl = ev.calendarUrl; // may be undefined for /today which only shows selected calendar
  const calendarBusy =
    busyCalendarUrls.size === 0
      ? true
      : calendarUrl
      ? busyCalendarUrls.has(calendarUrl)
      : true;
  const uid = ev.uid;
  let blocking = false;
  if (uid) {
    if (whitelistUIDs.has(uid)) blocking = false; // explicit allow
    else if (busyEventUIDs.has(uid)) blocking = true; // forced busy
    else if (calendarBusy) blocking = true; // calendar-level busy
  } else if (calendarBusy) {
    blocking = true; // no UID but calendar busy
  }
  const color = calendarUrl ? calendarColors[calendarUrl] : undefined;
  return { ...ev, blocking, color };
}

function parseDate(v: string) {
  if (!v) return new Date(NaN);
  v = v.trim();
  // Remove TZID param if present (handled by caller ignoring timezone differences)
  if (v.includes("T") && v.includes(":")) {
    // Already separated by colon earlier, so this is actual value
  }
  if (/^\d{8}T\d{6}Z$/.test(v)) {
    const y = +v.slice(0, 4);
    const m = +v.slice(4, 6) - 1;
    const d = +v.slice(6, 8);
    const H = +v.slice(9, 11);
    const M = +v.slice(11, 13);
    const S = +v.slice(13, 15);
    return new Date(Date.UTC(y, m, d, H, M, S));
  }
  if (/^\d{8}T\d{6}$/.test(v)) {
    const y = +v.slice(0, 4);
    const m = +v.slice(4, 6) - 1;
    const d = +v.slice(6, 8);
    const H = +v.slice(9, 11);
    const M = +v.slice(11, 13);
    const S = +v.slice(13, 15);
    return new Date(y, m, d, H, M, S);
  }
  if (/^\d{8}$/.test(v)) {
    const y = +v.slice(0, 4);
    const m = +v.slice(4, 6) - 1;
    const d = +v.slice(6, 8);
    return new Date(y, m, d);
  }
  return new Date(v);
}


// Delete event by UID (admin only)
router.post("/delete-event", requireAdmin, async (req, res) => {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: "uid_required" });
  let session = getSession();
  if (!session) await loadPersistedConfigIfNeeded();
  session = getSession();
  if (!session) return res.status(400).json({ error: "not_connected" });
  if (!session.calendarHref)
    return res.status(400).json({ error: "no_calendar_selected" });
  try {
    // Use the calendarHref as the cache key
    const cacheKey = createCacheKey(session.calendarHref);
    const events = await getCachedEvents(cacheKey) || [];
    const event = events.find((e: any) => e.uid === uid);
    if (!event || !event.url) return res.status(404).json({ error: "event_not_found" });
    // Use CalDAV DELETE
    const fetch = (global as any).fetch || require("node-fetch");
    const authHeader =
      session?.appleId && session?.appPassword
        ? {
            Authorization:
              "Basic " + Buffer.from(session.appleId + ":" + session.appPassword).toString("base64"),
          }
        : {};
    const result = await fetch(event.url, {
      method: "DELETE",
      headers: {
        ...(authHeader.Authorization ? { Authorization: authHeader.Authorization } : {}),
      } as Record<string, string>,
    });
    if (!result.ok) {
      return res.status(500).json({ error: "delete_failed", status: result.status });
    }
    // Remove from cache
    await setCachedEvents(cacheKey, events.filter((e: any) => e.uid !== uid));
    return res.json({ ok: true });
  } catch (err) {
    let message = 'Unknown error';
    if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
      message = (err as any).message;
    } else if (typeof err === 'string') {
      message = err;
    }
    return res.status(500).json({ error: 'Failed to delete iCloud event', details: message });
  }
});

export default router;

// --- Google helper (local minimal) ---
function buildGoogleClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error("Missing Google OAuth env vars");
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}
