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

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/**
 * Get blocking events for a specific date from busy calendars only
 */
async function getBlockingEventsForDate(targetDate: Date, req: any): Promise<CalendarEvent[]> {
  try {
    console.log(`[availability] Fetching blocking events for ${targetDate.toISOString().split('T')[0]}`);
    
    // Get calendar configuration from the icloud config endpoint
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    const headers = { cookie: req.headers.cookie || "" };
    
    console.log(`[availability] Fetching calendar config from: ${baseUrl}/api/icloud/config`);
    const configResp = await fetch(`${baseUrl}/api/icloud/config`, { headers });
    
    if (!configResp.ok) {
      console.warn(`[availability] Config fetch failed: ${configResp.status} ${configResp.statusText}`);
      return [];
    }
    
    const configData: any = await configResp.json();
    if (!Array.isArray(configData.calendars)) {
      console.warn(`[availability] Invalid config response format`);
      return [];
    }
    
    const busyCalendarUrls = configData.calendars
      .filter((cal: any) => cal.busy === true)
      .map((cal: any) => cal.url);
    
    console.log(`[availability] Found ${busyCalendarUrls.length} busy calendars:`, busyCalendarUrls.map((url: string) => url.split('/').pop()));
    
    // Use the merged endpoint to get all events, then filter by busy calendars
    console.log(`[availability] Fetching from merged endpoint: ${baseUrl}/api/merged/all`);
    const mergedResp = await fetch(`${baseUrl}/api/merged/all`, { headers });
    
    if (!mergedResp.ok) {
      console.warn(`[availability] Merged fetch failed: ${mergedResp.status} ${mergedResp.statusText}`);
      return [];
    }
    
    const mergedData: any = await mergedResp.json();
    if (!Array.isArray(mergedData.events)) {
      console.warn(`[availability] Invalid merged response format`);
      return [];
    }
    
    console.log(`[availability] Got ${mergedData.events.length} total events from merged endpoint`);
    
    // Filter to only events from busy calendars
    const busyEvents = mergedData.events.filter((event: any) => 
      event.calendarUrl && busyCalendarUrls.includes(event.calendarUrl)
    );
    
    console.log(`[availability] Filtered to ${busyEvents.length} events from busy calendars`);
    
    // Further filter to remove all-day events (they shouldn't block appointments)
    const appointmentBlockingEvents = busyEvents.filter((event: any) => {
      // Skip all-day events
      if (event.start.includes('T00:00:00') && event.end?.includes('T00:00:00')) {
        return false;
      }
      return true;
    });
    
    console.log(`[availability] Filtered to ${appointmentBlockingEvents.length} non-all-day events`);
    
    // Separate events that are already on the target date vs. recurring events to expand
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    const eventsOnDate: CalendarEvent[] = [];
    const recurringEventsToExpand: CalendarEvent[] = [];
    
    for (const event of appointmentBlockingEvents) {
      const eventStart = new Date(event.start);
      const eventDateStr = eventStart.toISOString().split('T')[0];
      
      if (eventDateStr === targetDateStr) {
        // Event is already on the target date
        eventsOnDate.push(event);
        console.log(`[availability] Found event on target date: "${event.summary}" at ${event.start}`);
      } else if (event.isRecurring && event.rrule) {
        // Recurring event that might expand to the target date
        recurringEventsToExpand.push(event);
        console.log(`[availability] Found recurring event to expand: "${event.summary}" with RRULE: ${event.rrule}`);
      }
    }
    
    console.log(`[availability] Events already on ${targetDateStr}: ${eventsOnDate.length}`);
    console.log(`[availability] Recurring events to expand: ${recurringEventsToExpand.length}`);
    
    // Expand recurring events for the target date
    const expandedEvents = expandEventsForDay(recurringEventsToExpand, targetDate);
    console.log(`[availability] Expanded to ${expandedEvents.length} recurring event occurrences`);
    
    // Combine one-off and expanded recurring events
    const allBlockingEvents = [...eventsOnDate, ...expandedEvents];
    
    console.log(`[availability] Total blocking events for ${targetDateStr}: ${allBlockingEvents.length}`);
    allBlockingEvents.forEach(event => {
      const startTime = new Date(event.start).toLocaleString('en-US', { 
        timeZone: 'America/Denver',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      const endTime = event.end ? new Date(event.end).toLocaleString('en-US', { 
        timeZone: 'America/Denver',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }) : 'N/A';
      console.log(`  - "${event.summary}": ${startTime} - ${endTime} MT`);
    });
    
    return allBlockingEvents;
    
  } catch (error) {
    console.error(`[availability] Error fetching blocking events:`, error);
    return [];
  }
}

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  console.log(`[availability] Checking availability - date: ${req.query.date}, duration: ${req.query.duration}, buffer: ${req.query.buffer}`);
  
  const dateStr = req.query.date as string | undefined;
  const duration = parseInt((req.query.duration as string) || "30", 10);
  const buffer = parseInt((req.query.buffer as string) || "0", 10);
  
  const date = dateStr ? dayjs(dateStr) : dayjs();
  if (!date.isValid()) return res.status(400).json({ error: "invalid date" });
  
  // Validate duration and buffer
  const slotLengthMins = Math.max(15, Math.min(240, duration)); // Between 15 minutes and 4 hours
  const bufferMins = Math.max(0, Math.min(60, buffer)); // Between 0 and 60 minutes

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

  // Parse business hours
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

  const parts = hours.split(/-/).map((p) => p.trim());
  if (parts.length !== 2) {
    return res.json({
      date: date.format("YYYY-MM-DD"),
      slots: [],
      openMinutes: null,
      closeMinutes: null,
    });
  }

  const openMinutes = toMinutes(parts[0]);
  const closeMinutes = toMinutes(parts[1]);
  if (openMinutes == null || closeMinutes == null) {
    return res.json({
      date: date.format("YYYY-MM-DD"),
      slots: [],
      openMinutes: null,
      closeMinutes: null,
    });
  }

  // Generate time slots for the business day
  let start = dayjs(date).startOf("day").add(openMinutes, "minute");
  const end = dayjs(date).startOf("day").add(closeMinutes, "minute");
  const slots: AvailabilitySlot[] = [];

  // Get existing internal meetings
  const existingMeetings = await listMeetings();
  
  // Get blocking events from busy calendars
  const targetDate = date.toDate();
  const blockingEvents = await getBlockingEventsForDate(targetDate, req);

  // Generate availability slots
  while (start.add(slotLengthMins, "minute").isBefore(end) || start.add(slotLengthMins, "minute").isSame(end)) {
    const slotStart = start;
    const slotEnd = start.add(slotLengthMins, "minute");
    
    // Check for internal meeting conflicts (including buffer)
    const overlapInternal = existingMeetings.some((meeting) => {
      if (meeting.status !== "scheduled") return false;
      const meetingStart = dayjs(meeting.start).subtract(bufferMins, "minute");
      const meetingEnd = dayjs(meeting.end).add(bufferMins, "minute");
      return slotStart.isBefore(meetingEnd) && slotEnd.isAfter(meetingStart);
    });
    
    // Check for external event conflicts (including buffer)
    const overlapExternal = blockingEvents.some((event) => {
      const eventStart = dayjs(event.start).subtract(bufferMins, "minute");
      const eventEnd = dayjs(event.end || event.start).add(bufferMins, "minute");
      return slotStart.isBefore(eventEnd) && slotEnd.isAfter(eventStart);
    });
    
    slots.push({
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      available: !(overlapInternal || overlapExternal),
    });
    
    start = slotEnd;
  }

  console.log(`[availability] Generated ${slots.length} slots, ${slots.filter(s => s.available).length} available`);

  res.json({
    date: date.format("YYYY-MM-DD"),
    slots,
    openMinutes,
    closeMinutes,
  });
});

console.log('[availability] Route file loaded');

export { router };