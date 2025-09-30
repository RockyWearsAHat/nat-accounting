import { Router } from "express";
import { requireAuth } from "../middleware/auth";

// Timestamp format normalization utility
// Converts various timestamp formats to consistent .000Z UTC format
function normalizeTimestampFormat(dateTimeStr: string): string {
  try {
    // Already in .000Z format - leave as-is (these are from iCloud, already converted to UTC)
    if (dateTimeStr.endsWith('.000Z')) {
      return dateTimeStr;
    }
    
    // Already in Z format without milliseconds - convert to .000Z for consistency
    if (dateTimeStr.endsWith('Z') && !dateTimeStr.includes('.')) {
      return dateTimeStr.replace('Z', '.000Z');
    }
    
    // Handle timezone-aware formats like "2025-10-21T10:30:00-07:00" (from Google)
    // These need to be converted to UTC .000Z format
    if (dateTimeStr.includes('+') || dateTimeStr.includes('-')) {
      const date = new Date(dateTimeStr);
      if (isNaN(date.getTime())) {
        console.warn('[merged] Invalid timezone-aware date:', dateTimeStr);
        return dateTimeStr;
      }
      return date.toISOString(); // This converts to UTC .000Z format
    }
    
    console.warn('[merged] Unrecognized timestamp format:', dateTimeStr);
    return dateTimeStr; // Return as-is for unknown formats
  } catch (error) {
    console.warn('[merged] Timestamp normalization error:', error, 'for:', dateTimeStr);
    return dateTimeStr;
  }
}

// Merged events endpoint that pulls from iCloud and Google week endpoints and returns a unified list.
// This avoids duplicating the complex expansion / filtering logic already implemented in the
// individual source routes by delegating to their HTTP endpoints (which are cached already).
//
// Query Params:
//   start=YYYY-MM-DD (required)
//   end=YYYY-MM-DD   (required)
//   sources=icloud,google (optional; default both)
//   blockingOnly=1   (optional; filters to blocking events only)
//   calendarUrls=url1,url2 (optional; only include events whose calendarUrl matches)
//
// Response Shape:
//   { range: { start, end }, events: [...], meta: { sourceCounts: { icloud: n, google: m }, filtered: { afterBlocking, afterCalendarFilter } } }

const router = Router();
router.use(requireAuth);

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}

function parseDateParam(v: string) {
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v) ? v : null;
}



router.get("/week", requireAdmin, async (req, res) => {
  const startStr = parseDateParam(String(req.query.start || ""));
  const endStr = parseDateParam(String(req.query.end || ""));
  if (!startStr || !endStr) return res.status(400).json({ error: "invalid_start_or_end_date" });

  const sourcesParam = String(req.query.sources || "icloud,google")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const sources = new Set(sourcesParam.length ? sourcesParam : ["icloud", "google"]);

  const blockingOnly = req.query.blockingOnly === "1";
  const calendarUrlsFilterRaw = String(req.query.calendarUrls || "").trim();
  const calendarUrlFilters = calendarUrlsFilterRaw
    ? new Set(
        calendarUrlsFilterRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;

  const from = new Date(startStr + "T00:00:00");
  const to = new Date(endStr + "T23:59:59.999");

  const headers: Record<string, string> = {};
  // Forward auth cookies (session) if present
  if (req.headers.cookie) headers["cookie"] = req.headers.cookie as string;

  // Use absolute URLs for internal fetches (Node.js fetch does not resolve relative URLs)
  const sourceCounts: Record<string, number> = {};
  const events: any[] = [];
  const fetches: Promise<void>[] = [];

  async function pull(source: string, urlPath: string) {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const url = `${baseUrl}${urlPath}?start=${startStr}&end=${endStr}`;
      const r = await (globalThis as any).fetch(url, { headers });
      if (!r.ok) {
        console.warn(`[merged] ${source} fetch failed status=${r.status}`);
        return;
      }
      const data = await r.json();
      const list = Array.isArray(data.events) ? data.events : [];
      sourceCounts[source] = list.length;
      for (const ev of list) {
        // Tag source for downstream UI logic (if needed)
        ev._source = source;
        
        // Normalize timestamps to consistent .000Z UTC format
        if (ev.start) {
          ev.start = normalizeTimestampFormat(ev.start);
        }
        if (ev.end) {
          ev.end = normalizeTimestampFormat(ev.end);
        }
        
        events.push(ev);
      }
    } catch (e: any) {
      console.warn(`[merged] ${source} fetch exception`, e?.message || e);
    }
  }

  if (sources.has("icloud")) fetches.push(pull("icloud", "/api/icloud/week"));
  if (sources.has("google")) fetches.push(pull("google", "/api/google/week"));

  await Promise.all(fetches);

  // Dedupe: same uid + start
  const dedupMap = new Map<string, any>();
  for (const ev of events) {
    const key = `${ev.uid || ev.summary}-${ev.start}`;
    if (!dedupMap.has(key)) dedupMap.set(key, ev);
  }
  let merged = Array.from(dedupMap.values());

  // Optional blocking filter
  if (blockingOnly) merged = merged.filter((e) => e.blocking === true);
  const afterBlocking = merged.length;

  // Optional calendar URL filter
  if (calendarUrlFilters && calendarUrlFilters.size) {
    merged = merged.filter((e) => !e.calendarUrl || calendarUrlFilters.has(e.calendarUrl));
  }
  const afterCalendarFilter = merged.length;

  merged.sort((a, b) => String(a.start).localeCompare(String(b.start)));

  res.json({
    range: { start: from.toISOString(), end: to.toISOString() },
    events: merged,
    meta: {
      sourceCounts,
      filtered: { afterBlocking, afterCalendarFilter },
      sources: Array.from(sources),
    },
  });
});

router.get("/all", requireAdmin, async (req, res) => {
  const sourcesParam = String(req.query.sources || "icloud,google")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const sources = new Set(sourcesParam.length ? sourcesParam : ["icloud", "google"]);

  const blockingOnly = req.query.blockingOnly === "1";
  const calendarUrlsFilterRaw = String(req.query.calendarUrls || "").trim();
  const calendarUrlFilters = calendarUrlsFilterRaw
    ? new Set(
        calendarUrlsFilterRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;

  const headers: Record<string, string> = {};
  // Forward auth cookies (session) if present
  if (req.headers.cookie) headers["cookie"] = req.headers.cookie as string;

  // Use absolute URLs for internal fetches
  const sourceCounts: Record<string, number> = {};
  const events: any[] = [];
  const fetches: Promise<void>[] = [];

  async function pullAll(source: string, urlPath: string) {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const url = `${baseUrl}${urlPath}`;
      const r = await (globalThis as any).fetch(url, { headers });
      if (!r.ok) {
        console.warn(`[merged] ${source} fetch failed status=${r.status}`);
        return;
      }
      const data = await r.json();
      const list = Array.isArray(data.events) ? data.events : [];
      sourceCounts[source] = list.length;
      for (const ev of list) {
        // Tag source for downstream UI logic (if needed)
        ev._source = source;
        
        // Normalize timestamps to consistent .000Z UTC format
        if (ev.start) {
          ev.start = normalizeTimestampFormat(ev.start);
        }
        if (ev.end) {
          ev.end = normalizeTimestampFormat(ev.end);
        }
        
        events.push(ev);
      }
    } catch (e: any) {
      console.warn(`[merged] ${source} fetch exception`, e?.message || e);
    }
  }

  if (sources.has("icloud")) fetches.push(pullAll("icloud", "/api/icloud/all"));
  if (sources.has("google")) fetches.push(pullAll("google", "/api/google/all"));

  await Promise.all(fetches);

  // Dedupe: same uid + start
  const dedupMap = new Map<string, any>();
  for (const ev of events) {
    const key = `${ev.uid || ev.summary}-${ev.start}`;
    if (!dedupMap.has(key)) dedupMap.set(key, ev);
  }
  let merged = Array.from(dedupMap.values());

  // Optional blocking filter
  if (blockingOnly) merged = merged.filter((e) => e.blocking === true);
  const afterBlocking = merged.length;

  // Optional calendar URL filter
  if (calendarUrlFilters && calendarUrlFilters.size) {
    merged = merged.filter((e) => !e.calendarUrl || calendarUrlFilters.has(e.calendarUrl));
  }
  const afterCalendarFilter = merged.length;

  merged.sort((a, b) => String(a.start).localeCompare(String(b.start)));

  res.json({
    events: merged,
    meta: {
      sourceCounts,
      filtered: { afterBlocking, afterCalendarFilter },
      sources: Array.from(sources),
    },
  });
  return;
});

export { router };
