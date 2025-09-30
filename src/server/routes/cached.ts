import { Router } from "express";
import { CachedEventModel } from "../models/CachedEvent";
import { SyncTokenModel } from "../models/SyncToken";
import { syncService } from "../services/CalendarSyncService";
import { requireAuth } from "../middleware/auth";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const router = Router();

// All endpoints require authentication
router.use(requireAuth);

/**
 * Get all events from cache (instant response)
 * Triggers background sync if data is stale
 */
router.get("/all", async (req, res) => {
  try {
    const { refresh } = req.query;
    
    // Get events from cache (instant response)
    const events = await CachedEventModel.find({ 
      deleted: false,
      start: { 
        $gte: dayjs().subtract(6, 'months').toDate(),
        $lte: dayjs().add(12, 'months').toDate()
      }
    }).sort({ start: 1 }).lean();

    // Transform to frontend format
    const transformedEvents = events.map(event => ({
      id: event.eventId,
      title: event.title,
      start: event.start.toISOString(),
      end: event.end?.toISOString(),
      allDay: event.allDay,
      description: event.description,
      location: event.location,
      color: event.color,
      provider: event.provider,
      calendarId: event.calendarId,
      blocking: event.blocking,
      lastModified: event.lastModified.toISOString()
    }));

    // Check if we need background sync
    const shouldSync = refresh === 'true' || await shouldTriggerBackgroundSync();
    
    if (shouldSync) {
      // Trigger background sync (don't wait for it)
      syncService.syncAllCalendars().catch(error => {
        console.error("Background sync failed:", error);
      });
    }

    res.json({
      events: transformedEvents,
      cached: true,
      syncTriggered: shouldSync,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Cache-first events fetch failed:", error);
    res.status(500).json({ 
      error: "Failed to fetch events from cache",
      events: [],
      cached: false 
    });
  }
});

/**
 * Get events for specific date range from cache
 */
router.get("/range", async (req, res) => {
  try {
    const { start, end } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({ error: "start and end dates required" });
    }

    const startDate = new Date(start as string);
    const endDate = new Date(end as string);

    const events = await CachedEventModel.find({
      deleted: false,
      $or: [
        { start: { $gte: startDate, $lte: endDate } },
        { end: { $gte: startDate, $lte: endDate } },
        { start: { $lte: startDate }, end: { $gte: endDate } }
      ]
    }).sort({ start: 1 }).lean();

    const transformedEvents = events.map(event => ({
      id: event.eventId,
      title: event.title,
      start: event.start.toISOString(),
      end: event.end?.toISOString(),
      allDay: event.allDay,
      description: event.description,
      location: event.location,
      color: event.color,
      provider: event.provider,
      calendarId: event.calendarId,
      blocking: event.blocking
    }));

    res.json({
      events: transformedEvents,
      cached: true,
      range: { start: startDate, end: endDate }
    });

  } catch (error) {
    console.error("Range events fetch failed:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

/**
 * Get events for a specific day from cache (with RRULE expansion like iCloud endpoint)
 */
router.get("/day", async (req, res) => {
  try {
    const { date } = req.query;
    console.log(`[cached/day] DEBUG: Endpoint hit for date=${date}`);
    
    if (!date) {
      return res.status(400).json({ error: "date parameter required" });
    }

    // Parse the requested date
    const targetDate = dayjs(date as string).toDate();
    const dayStart = dayjs(targetDate).startOf('day').toDate();
    const dayEnd = dayjs(targetDate).endOf('day').toDate();

    console.log(`[cached/day] Looking for events on ${date}: ${dayStart.toISOString()} to ${dayEnd.toISOString()}`);

    // Get all cached events (both regular and recurring)
    const allCachedEvents = await CachedEventModel.find({
      deleted: { $ne: true }
    }).lean();

    console.log(`[cached/day] Found ${allCachedEvents.length} total cached events`);

    const expandedEvents: any[] = [];

    for (const cachedEvent of allCachedEvents) {
      // Check if this is a recurring event with RRULE data
      if (cachedEvent.rrule && cachedEvent.raw) {
        console.log(`[cached/day] Processing recurring event: "${cachedEvent.title}" with RRULE: ${cachedEvent.rrule.substring(0, 50)}...`);
        
        try {
          // Import RRULE library
          const { rrulestr } = await import('rrule');
          
          // Extract DTSTART from raw iCal data to preserve timezone info
          const dtstartMatch = cachedEvent.raw.match(/DTSTART([^:]*):(.+)/);
          if (!dtstartMatch) {
            console.warn(`[cached/day] No DTSTART found in raw data for ${cachedEvent.title}`);
            continue;
          }
          
          const startDateStr = dtstartMatch[2].trim();
          const rruleStr = `DTSTART:${startDateStr}\nRRULE:${cachedEvent.rrule}`;
          
          const rule = rrulestr(rruleStr);
          const occurrences = rule.between(dayStart, dayEnd, true);
          
          // Calculate event duration
          const originalStart = new Date(cachedEvent.start);
          const originalEnd = cachedEvent.end ? new Date(cachedEvent.end) : new Date(originalStart.getTime() + 30 * 60 * 1000);
          const eventDuration = originalEnd.getTime() - originalStart.getTime();
          
          console.log(`[cached/day] Found ${occurrences.length} occurrences for "${cachedEvent.title}" on ${date}`);
          
          for (const occurrence of occurrences) {
            const occurrenceEnd = new Date(occurrence.getTime() + eventDuration);
            
            expandedEvents.push({
              id: `${cachedEvent.eventId}_${occurrence.toISOString()}`,
              title: cachedEvent.title,
              start: occurrence.toISOString(),
              end: occurrenceEnd.toISOString(),
              allDay: cachedEvent.allDay,
              description: cachedEvent.description,
              location: cachedEvent.location,
              color: cachedEvent.color,
              provider: cachedEvent.provider,
              calendarId: cachedEvent.calendarId,
              blocking: cachedEvent.blocking,
              isRecurring: true
            });
          }
        } catch (rruleError) {
          console.error(`[cached/day] RRULE expansion failed for "${cachedEvent.title}":`, rruleError);
          
          // Fallback: check if original event falls on this day
          const eventStart = dayjs(cachedEvent.start);
          const eventEnd = cachedEvent.end ? dayjs(cachedEvent.end) : eventStart.add(30, 'minute');
          
          if (eventStart.isBefore(dayEnd) && eventEnd.isAfter(dayStart)) {
            expandedEvents.push({
              id: cachedEvent.eventId,
              title: cachedEvent.title,
              start: cachedEvent.start.toISOString(),
              end: cachedEvent.end?.toISOString(),
              allDay: cachedEvent.allDay,
              description: cachedEvent.description,
              location: cachedEvent.location,
              color: cachedEvent.color,
              provider: cachedEvent.provider,
              calendarId: cachedEvent.calendarId,
              blocking: cachedEvent.blocking,
              isRecurring: true
            });
          }
        }
      } else {
        // Non-recurring event - check if it overlaps with the requested day
        const eventStart = dayjs(cachedEvent.start);
        const eventEnd = cachedEvent.end ? dayjs(cachedEvent.end) : eventStart.add(30, 'minute');
        
        if (eventStart.isBefore(dayEnd) && eventEnd.isAfter(dayStart)) {
          expandedEvents.push({
            id: cachedEvent.eventId,
            title: cachedEvent.title,
            start: cachedEvent.start.toISOString(),
            end: cachedEvent.end?.toISOString(),
            allDay: cachedEvent.allDay,
            description: cachedEvent.description,
            location: cachedEvent.location,
            color: cachedEvent.color,
            provider: cachedEvent.provider,
            calendarId: cachedEvent.calendarId,
            blocking: cachedEvent.blocking,
            isRecurring: false
          });
        }
      }
    }

    console.log(`[cached/day] Returning ${expandedEvents.length} expanded events for ${date}`);
    expandedEvents.forEach(event => {
      console.log(`[cached/day] Event: "${event.title}" ${event.start} - ${event.end} (recurring: ${event.isRecurring})`);
    });

    res.json({
      events: expandedEvents,
      cached: true,
      date: dayStart
    });

  } catch (error) {
    console.error("Day events fetch failed:", error);
    res.status(500).json({ error: "Failed to fetch day events" });
  }
});

/**
 * Get sync status and statistics
 */
router.get("/sync/status", async (req, res) => {
  try {
    const syncTokens = await SyncTokenModel.find({}).lean();
    const totalEvents = await CachedEventModel.countDocuments({ deleted: false });
    const lastSync = await SyncTokenModel.findOne({}).sort({ lastSyncAt: -1 }).lean();

    const status = {
      totalCalendars: syncTokens.length,
      activeCalendars: syncTokens.filter(t => t.isActive).length,
      totalEvents,
      lastSyncAt: lastSync?.lastSyncAt,
      calendars: syncTokens.map(token => ({
        provider: token.provider,
        calendarId: token.calendarId,
        isActive: token.isActive,
        isSyncing: token.isSyncing,
        lastSyncAt: token.lastSyncAt,
        syncErrors: token.syncErrors,
        lastError: token.lastError,
        totalEvents: token.totalEvents,
        syncDuration: token.syncDuration
      }))
    };

    res.json(status);

  } catch (error) {
    console.error("Sync status fetch failed:", error);
    res.status(500).json({ error: "Failed to fetch sync status" });
  }
});

/**
 * Trigger manual sync (admin only)
 */
router.post("/sync/trigger", async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Don't wait for sync to complete, return immediately
    syncService.syncAllCalendars().then(results => {
      console.log("Manual sync completed:", results);
    }).catch(error => {
      console.error("Manual sync failed:", error);
    });

    res.json({ 
      message: "Sync triggered successfully",
      triggered: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Manual sync trigger failed:", error);
    res.status(500).json({ error: "Failed to trigger sync" });
  }
});

/**
 * Force full resync (admin only)
 */
router.post("/sync/reset", async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    await syncService.forceFullResync();
    
    res.json({ 
      message: "Full resync initiated - sync tokens cleared",
      reset: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Full resync failed:", error);
    res.status(500).json({ error: "Failed to reset sync" });
  }
});



/**
 * Add a local event to the cache (for user-created appointments)
 */
router.post("/events", async (req, res) => {
  try {
    const { title, start, end, description, location, allDay = false } = req.body;
    
    if (!title || !start) {
      return res.status(400).json({ error: "title and start are required" });
    }

    // Generate unique ID for local event
    const eventId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const cachedEvent = await CachedEventModel.create({
      eventId,
      calendarId: 'local',
      provider: 'local',
      title,
      start: new Date(start),
      end: end ? new Date(end) : undefined,
      allDay,
      description,
      location,
      lastModified: new Date(),
      syncedAt: new Date(),
      blocking: true,
      deleted: false
    });

    const transformedEvent = {
      id: cachedEvent.eventId,
      title: cachedEvent.title,
      start: cachedEvent.start.toISOString(),
      end: cachedEvent.end?.toISOString(),
      allDay: cachedEvent.allDay,
      description: cachedEvent.description,
      location: cachedEvent.location,
      provider: 'local',
      calendarId: 'local',
      blocking: true
    };

    res.json({
      event: transformedEvent,
      created: true
    });

  } catch (error) {
    console.error("Create local event failed:", error);
    res.status(500).json({ error: "Failed to create event" });
  }
});

/**
 * Check if background sync should be triggered
 */
async function shouldTriggerBackgroundSync(): Promise<boolean> {
  try {
    const lastSync = await SyncTokenModel.findOne({}).sort({ lastSyncAt: -1 }).lean();
    
    if (!lastSync) {
      return true; // No sync tokens yet, trigger sync
    }
    
    // Trigger sync if last sync was more than 5 minutes ago
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return lastSync.lastSyncAt < fiveMinutesAgo;
    
  } catch (error) {
    console.error("Error checking sync status:", error);
    return false;
  }
}

export { router };