import { Router } from "express";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import type { AvailabilitySlot } from "../types";
import { listMeetings } from "../scheduling";
import { expandEventsForDay, CalendarEvent } from "../rruleExpander";
import { requireAuth } from "../middleware/auth";
import { CalendarConfigModel } from "../models/CalendarConfig";

const router = Router();

// In-memory cache for calendar config and events
const cache = {
  calendarConfig: null as any,
  calendarConfigExpiry: 0,
  events: new Map<string, { events: CalendarEvent[], expiry: number }>(),
  // Cache duration in milliseconds
  CONFIG_TTL: 5 * 60 * 1000, // 5 minutes for config
  EVENTS_TTL: 2 * 60 * 1000,  // 2 minutes for events
};

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/**
 * Get calendar configuration with caching
 */
async function getCachedCalendarConfig(req: any): Promise<any> {
  const now = Date.now();
  
  // Return cached config if still valid
  if (cache.calendarConfig && now < cache.calendarConfigExpiry) {
    console.log(`[availability] Using cached calendar config`);
    return cache.calendarConfig;
  }
  
  console.log(`[availability] Fetching fresh calendar config`);
  
  try {
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    const headers = { cookie: req.headers.cookie || "" };
    
    const configResp = await fetch(`${baseUrl}/api/icloud/config`, { headers });
    
    if (!configResp.ok) {
      console.warn(`[availability] Config fetch failed: ${configResp.status}`);
      return null;
    }
    
    const configData = await configResp.json();
    
    // Cache the result
    cache.calendarConfig = configData;
    cache.calendarConfigExpiry = now + cache.CONFIG_TTL;
    
    return configData;
  } catch (error) {
    console.error(`[availability] Error fetching calendar config:`, error);
    return null;
  }
}

/**
 * Get events with caching
 */
async function getCachedEvents(req: any): Promise<CalendarEvent[]> {
  const now = Date.now();
  const cacheKey = 'merged_events';
  
  // Return cached events if still valid
  const cached = cache.events.get(cacheKey);
  if (cached && now < cached.expiry) {
    console.log(`[availability] Using cached events (${cached.events.length} events)`);
    return cached.events;
  }
  
  console.log(`[availability] Fetching fresh events`);
  
  try {
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    const headers = { cookie: req.headers.cookie || "" };
    
    const mergedResp = await fetch(`${baseUrl}/api/merged/all`, { headers });
    
    if (!mergedResp.ok) {
      console.warn(`[availability] Events fetch failed: ${mergedResp.status}`);
      return [];
    }
    
    const mergedData: any = await mergedResp.json();
    const events = Array.isArray(mergedData.events) ? mergedData.events : [];
    
    // Cache the result
    cache.events.set(cacheKey, { events, expiry: now + cache.EVENTS_TTL });
    
    console.log(`[availability] Cached ${events.length} events`);
    return events;
  } catch (error) {
    console.error(`[availability] Error fetching events:`, error);
    return [];
  }
}

/**
 * Optimized function to get blocking events for a specific date
 */
async function getBlockingEventsForDate(targetDate: Date, req: any): Promise<CalendarEvent[]> {
  const targetDateStr = targetDate.toISOString().split('T')[0];
  console.log(`[availability] Getting blocking events for ${targetDateStr}`);
  
  // Fetch config and events in parallel
  const [configData, allEvents] = await Promise.all([
    getCachedCalendarConfig(req),
    getCachedEvents(req)
  ]);
  
  if (!configData || !Array.isArray(configData.calendars)) {
    console.warn(`[availability] No valid calendar config`);
    return [];
  }
  
  // Get busy calendar URLs
  const busyCalendarUrls = new Set(
    configData.calendars
      .filter((cal: any) => cal.busy === true)
      .map((cal: any) => cal.url)
  );
  
  console.log(`[availability] Found ${busyCalendarUrls.size} busy calendars`);
  
  // Filter to events from busy calendars and non-all-day events
  const relevantEvents = allEvents.filter((event: any) => {
    // Must be from a busy calendar
    if (!event.calendarUrl || !busyCalendarUrls.has(event.calendarUrl)) {
      return false;
    }
    
    // Skip all-day events (they don't block appointments)
    if (event.start.includes('T00:00:00') && event.end?.includes('T00:00:00')) {
      return false;
    }
    
    return true;
  });
  
  console.log(`[availability] Filtered to ${relevantEvents.length} relevant events`);
  
  // Separate events by type for efficient processing
  const eventsOnDate: CalendarEvent[] = [];
  const recurringEventsToExpand: CalendarEvent[] = [];
  
  for (const event of relevantEvents) {
    const eventStart = new Date(event.start);
    const eventDateStr = eventStart.toISOString().split('T')[0];
    
    if (eventDateStr === targetDateStr) {
      eventsOnDate.push(event);
    } else if (event.isRecurring && event.rrule) {
      recurringEventsToExpand.push(event);
    }
  }
  
  console.log(`[availability] ${eventsOnDate.length} events on date, ${recurringEventsToExpand.length} recurring to expand`);
  
  // Expand recurring events
  const expandedEvents = recurringEventsToExpand.length > 0 
    ? expandEventsForDay(recurringEventsToExpand, targetDate)
    : [];
  
  const allBlockingEvents = [...eventsOnDate, ...expandedEvents];
  
  console.log(`[availability] Total blocking events: ${allBlockingEvents.length}`);
  
  return allBlockingEvents;
}

// Pre-compute business hours parsing function
const businessHoursCache = new Map<string, { openMinutes: number, closeMinutes: number } | null>();

function parseBusinessHours(hoursStr: string): { openMinutes: number, closeMinutes: number } | null {
  if (businessHoursCache.has(hoursStr)) {
    return businessHoursCache.get(hoursStr)!;
  }
  
  const toMinutes = (s: string): number | null => {
    s = s.trim().toLowerCase();
    const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (m) {
      let h = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      const period = m[3];
      if (h === 12) h = 0; // 12am -> 0
      if (period === "pm") h += 12;
      return h * 60 + min;
    }
    const m24 = s.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (m24) {
      const h = parseInt(m24[1], 10);
      const min = m24[2] ? parseInt(m24[2], 10) : 0;
      if (h > 23 || min > 59) return null;
      return h * 60 + min;
    }
    return null;
  };

  const parts = hoursStr.split(/-/).map((p) => p.trim());
  if (parts.length !== 2) {
    businessHoursCache.set(hoursStr, null);
    return null;
  }

  const openMinutes = toMinutes(parts[0]);
  const closeMinutes = toMinutes(parts[1]);
  
  if (openMinutes == null || closeMinutes == null) {
    businessHoursCache.set(hoursStr, null);
    return null;
  }
  
  const result = { openMinutes, closeMinutes };
  businessHoursCache.set(hoursStr, result);
  return result;
}

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const startTime = Date.now();
  console.log(`[availability] Request started - date: ${req.query.date}, duration: ${req.query.duration}, buffer: ${req.query.buffer}`);
  
  const dateStr = req.query.date as string | undefined;
  const duration = parseInt((req.query.duration as string) || "30", 10);
  const buffer = parseInt((req.query.buffer as string) || "0", 10);
  
  const date = dateStr ? dayjs(dateStr) : dayjs();
  if (!date.isValid()) return res.status(400).json({ error: "invalid date" });
  
  // Validate duration and buffer
  const slotLengthMins = Math.max(15, Math.min(240, duration));
  const bufferMins = Math.max(0, Math.min(60, buffer));

  // Get business hours for the day
  const hoursPath = path.join(process.cwd(), "hoursOfOperation.json");
  const hoursRaw = JSON.parse(fs.readFileSync(hoursPath, "utf-8")) as Record<string, string>;
  const weekday = date.format("dddd").toLowerCase();
  const hours = hoursRaw[weekday];
  
  if (!hours) {
    return res.json({
      date: date.format("YYYY-MM-DD"),
      slots: [],
      openMinutes: null,
      closeMinutes: null,
    });
  }

  const businessHours = parseBusinessHours(hours);
  if (!businessHours) {
    return res.json({
      date: date.format("YYYY-MM-DD"),
      slots: [],
      openMinutes: null,
      closeMinutes: null,
    });
  }

  const { openMinutes, closeMinutes } = businessHours;

  // Get data in parallel
  const targetDate = date.toDate();
  const [existingMeetings, blockingEvents] = await Promise.all([
    listMeetings(),
    getBlockingEventsForDate(targetDate, req)
  ]);

  // Generate availability slots efficiently
  let start = dayjs(date).startOf("day").add(openMinutes, "minute");
  const end = dayjs(date).startOf("day").add(closeMinutes, "minute");
  const slots: AvailabilitySlot[] = [];

  // Pre-process meetings for faster lookup
  const scheduledMeetings = existingMeetings
    .filter(m => m.status === "scheduled")
    .map(m => ({
      start: dayjs(m.start).subtract(bufferMins, "minute"),
      end: dayjs(m.end).add(bufferMins, "minute")
    }));

  // Pre-process blocking events for faster lookup
  const processedBlockingEvents = blockingEvents.map(event => ({
    start: dayjs(event.start).subtract(bufferMins, "minute"),
    end: dayjs(event.end || event.start).add(bufferMins, "minute")
  }));

  // Generate slots with optimized overlap checking
  while (start.add(slotLengthMins, "minute").isBefore(end) || start.add(slotLengthMins, "minute").isSame(end)) {
    const slotStart = start;
    const slotEnd = start.add(slotLengthMins, "minute");
    
    // Check for conflicts using pre-processed data
    const hasConflict = 
      scheduledMeetings.some(meeting => 
        slotStart.isBefore(meeting.end) && slotEnd.isAfter(meeting.start)
      ) ||
      processedBlockingEvents.some(event => 
        slotStart.isBefore(event.end) && slotEnd.isAfter(event.start)
      );
    
    slots.push({
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      available: !hasConflict,
    });
    
    start = slotEnd;
  }

  const processingTime = Date.now() - startTime;
  const availableCount = slots.filter(s => s.available).length;
  
  console.log(`[availability] Completed in ${processingTime}ms - ${slots.length} slots, ${availableCount} available`);

  res.json({
    date: date.format("YYYY-MM-DD"),
    slots,
    openMinutes,
    closeMinutes,
  });
});

console.log('[availability] Optimized route file loaded');

export { router };