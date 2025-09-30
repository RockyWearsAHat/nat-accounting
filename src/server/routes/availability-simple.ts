import { Router } from "express";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import fs from "fs";
import path from "path";
import pkg from "rrule";
const { rrulestr } = pkg;

// Configure dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);
import type { AvailabilitySlot } from "../types";
import { requireAuth } from "../middleware/auth";
import { CachedEventModel } from "../models/CachedEvent";
import { listMeetings } from "../scheduling";
import { expandEventsForDay } from "../rruleExpander";

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/**
 * Simple, fast availability endpoint
 * Just return business hours for now - we can add event blocking later
 */
router.get("/", async (req, res) => {
  console.log("=== AVAILABILITY REQUEST HIT ===");
  try {
    const { date, duration = "30", buffer = "0" } = req.query;
    
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "Date parameter required (YYYY-MM-DD)" });
    }

    // Create target date in Mountain Time to match business hours
    const targetDate = dayjs.tz(date, 'America/Denver');
    if (!targetDate.isValid()) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    const slotDuration = parseInt(duration as string, 10);
    const bufferMinutes = parseInt(buffer as string, 10);

    console.log(`[availability] Checking availability for ${targetDate.format("YYYY-MM-DD")}, ${slotDuration}min slots with ${bufferMinutes}min buffer`);

    // Get business hours from file (parse actual format: "7am - 5pm")
    const hoursFile = path.join(process.cwd(), "hoursOfOperation.json");
    let businessHours: any = {};
    
    try {
      const hoursData = fs.readFileSync(hoursFile, "utf-8");
      const rawHours = JSON.parse(hoursData);
      
      // Convert "7am - 5pm" format to structured format
      for (const [day, timeRange] of Object.entries(rawHours)) {
        if (typeof timeRange === 'string' && timeRange.includes(' - ')) {
          const [start, end] = timeRange.split(' - ');
          businessHours[day] = {
            start: start.replace('am', ' AM').replace('pm', ' PM'),
            end: end.replace('am', ' AM').replace('pm', ' PM'),
            enabled: true
          };
        }
      }
    } catch (error) {
      console.log("[availability-simple] No business hours file, using defaults");
      businessHours = {
        monday: { start: "9:00 AM", end: "5:00 PM", enabled: true },
        tuesday: { start: "9:00 AM", end: "5:00 PM", enabled: true },
        wednesday: { start: "9:00 AM", end: "5:00 PM", enabled: true },
        thursday: { start: "9:00 AM", end: "5:00 PM", enabled: true },
        friday: { start: "9:00 AM", end: "5:00 PM", enabled: true },
        saturday: { start: "10:00 AM", end: "2:00 PM", enabled: false },
        sunday: { start: "10:00 AM", end: "2:00 PM", enabled: false }
      };
    }

    const dayName = targetDate.format("dddd").toLowerCase();
    const dayHours = businessHours[dayName];
    
    console.log(`[availability-simple] Day: ${dayName}, Hours:`, dayHours);

    if (!dayHours?.enabled) {
      return res.json({ available: false, slots: [], reason: "Business closed on this day" });
    }

    // Parse business hours (handle both "7:00 AM" and "7 AM" formats)
    const parseTime = (timeStr: string): number => {
      // Handle formats like "7 AM", "7:00 AM", "7:30 AM"
      const match = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
      if (!match) {
        console.log(`[availability-simple] Failed to parse time: "${timeStr}"`);
        return 0;
      }
      
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const period = match[3].toUpperCase();
      
      if (period === "PM" && hours !== 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
      
      const totalMinutes = hours * 60 + minutes;
      console.log(`[availability-simple] Parsed "${timeStr}" -> ${hours}:${minutes.toString().padStart(2, '0')} (${totalMinutes} minutes)`);
      return totalMinutes;
    };

    const openMinutes = parseTime(dayHours.start);
    const closeMinutes = parseTime(dayHours.end);

    if (openMinutes >= closeMinutes) {
      return res.json({ available: false, slots: [] });
    }

    // Use cached events from MongoDB and expand RRULE for the target date
    console.log(`[availability] Getting cached events for ${date} from MongoDB`);
    
    let cachedEvents: any[] = [];
    
    try {
      // Get the target date range for the day
      const targetDate = dayjs.tz(date as string, 'America/Denver');
      const dayStart = targetDate.startOf('day').utc().toDate();
      const dayEnd = targetDate.endOf('day').utc().toDate();
      
      console.log(`[availability] Querying for events between ${dayStart.toISOString()} and ${dayEnd.toISOString()}`);
      
      // Query cached events from MongoDB
      const dbEvents = await CachedEventModel.find({
        deleted: { $ne: true },
        allDay: { $ne: true },
        blocking: { $ne: false },
        $or: [
          // Non-recurring events that fall within the day
          {
            recurring: { $ne: true },
            start: { $gte: dayStart, $lt: dayEnd }
          },
          // Recurring events - we'll expand these with RRULE
          {
            recurring: true,
            rrule: { $exists: true, $ne: null }
          }
        ]
      }).lean();
      
      console.log(`[availability] Found ${dbEvents.length} potential events (including recurring)`);
      
      // Convert MongoDB events to the format expected by expandEventsForDay
      const formattedEvents = dbEvents.map(event => ({
        uid: event.eventId,
        summary: event.title,
        start: event.start.toISOString(),
        end: event.end ? event.end.toISOString() : undefined,
        isRecurring: event.recurring || false,
        rrule: event.rrule,
        blocking: event.blocking !== false
      }));
      
      // Expand recurring events for the target date
      const { expandEventsForDay } = await import("../rruleExpander");
      const expandedEvents = await expandEventsForDay(formattedEvents, targetDate.toDate());
      
      console.log(`[availability] After RRULE expansion: ${expandedEvents.length} events`);
      
      expandedEvents.forEach(event => {
        const eventStartMT = dayjs.utc(event.start).tz('America/Denver');
        const eventEndMT = dayjs.utc(event.end || event.start).tz('America/Denver');
        console.log(`[availability] Event: "${event.summary}" ${eventStartMT.format("h:mm A")}-${eventEndMT.format("h:mm A")} MT`);
      });

      cachedEvents = expandedEvents.map(event => ({
        title: event.summary,
        start: event.start, // Already ISO string
        end: event.end || event.start,
        blocking: event.blocking !== false,
        eventId: event.uid
      }));
      
    } catch (error) {
      console.error("[availability] Failed to get cached events:", error);
      cachedEvents = [];
    }    // Generate available slots and check against existing meetings
    const slots: AvailabilitySlot[] = [];
    const totalSlotTime = slotDuration + bufferMinutes;

    for (let current = openMinutes; current + slotDuration <= closeMinutes; current += totalSlotTime) {
      const startHour = Math.floor(current / 60);
      const startMin = current % 60;
      const endHour = Math.floor((current + slotDuration) / 60);
      const endMin = (current + slotDuration) % 60;

      const startTime = targetDate
        .hour(startHour)
        .minute(startMin)
        .second(0)
        .millisecond(0);
      
      const endTime = targetDate
        .hour(endHour)
        .minute(endMin)
        .second(0)
        .millisecond(0);

      // Check if this slot conflicts with any blocking events
      const hasConflict = cachedEvents.some((event: any) => {
        // Handle different event formats (cached vs expanded)
        const eventTitle = event.title || 'Untitled Event';
        
        // Events are stored in UTC, convert to Mountain Time for comparison
        const eventStartMT = dayjs.utc(event.start).tz('America/Denver');
        const eventEndMT = event.end ? dayjs.utc(event.end).tz('America/Denver') : eventStartMT.add(30, 'minute');
        
        // Add buffer time around events (working in MT)
        const eventStartWithBuffer = eventStartMT.subtract(bufferMinutes, 'minute');
        const eventEndWithBuffer = eventEndMT.add(bufferMinutes, 'minute');
        
        // Check for overlap: slot start < event end && slot end > event start (both in MT)
        const overlap = startTime.isBefore(eventEndWithBuffer) && endTime.isAfter(eventStartWithBuffer);
        
        if (overlap) {
          console.log(`[availability] Conflict: slot ${startTime.format("h:mm A")}-${endTime.format("h:mm A")} MT overlaps with "${eventTitle}" ${eventStartMT.format("h:mm A")}-${eventEndMT.format("h:mm A")} MT`);
        }
        
        return overlap;
      });

      if (!hasConflict) {
        slots.push({
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          available: true
        });
      } else {
        console.log(`[availability-simple] Slot ${startTime.format("h:mm A")} blocked by existing meeting`);
      }
    }

    console.log(`[availability-simple] Generated ${slots.length} slots for ${date}`);
    console.log(`[availability-simple] Open: ${openMinutes}min (${Math.floor(openMinutes/60)}:${(openMinutes%60).toString().padStart(2,'0')})`);
    console.log(`[availability-simple] Close: ${closeMinutes}min (${Math.floor(closeMinutes/60)}:${(closeMinutes%60).toString().padStart(2,'0')})`);
    console.log(`[availability-simple] Slot duration: ${slotDuration}min, Buffer: ${bufferMinutes}min, Total: ${totalSlotTime}min`);

    return res.json({
      available: slots.length > 0,
      slots,
      businessHours: {
        open: dayHours.start,
        close: dayHours.end
      },
      debug: {
        dayName,
        openMinutes,
        closeMinutes,
        slotDuration,
        bufferMinutes,
        totalSlotTime
      }
    });

  } catch (error) {
    console.error("[availability-simple] Error:", error);
    res.status(500).json({ error: "Failed to get availability" });
  }
});

export default router;