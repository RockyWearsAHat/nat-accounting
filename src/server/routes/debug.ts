import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { expandEventsForDay, filterBlockingEvents } from "../rruleExpander";

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

router.get("/test-expansion", requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log(`[debug] Testing RRULE expansion for September 29, 2025`);
    
    // Get all events from merged endpoint
    const allRawEvents: any[] = [];
    const headers = { cookie: req.headers.cookie || "" };
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    
    // Fetch from merged endpoint
    const mergedResp = await fetch(`${baseUrl}/api/merged/all`, { headers });
    if (mergedResp.ok) {
      const mergedData: any = await mergedResp.json();
      if (Array.isArray(mergedData.events)) {
        allRawEvents.push(...mergedData.events);
      }
    }
    
    console.log(`[debug] Got ${allRawEvents.length} total raw events`);
    
    // Find the Exam event
    const examEvent = allRawEvents.find((e: any) => e.summary?.includes('Exam Acctg 5210'));
    console.log(`[debug] Exam event:`, examEvent ? {
      summary: examEvent.summary,
      start: examEvent.start,
      end: examEvent.end,
      blocking: examEvent.blocking,
      isRecurring: examEvent.isRecurring,
      rrule: examEvent.rrule
    } : 'NOT FOUND');
    
    // Filter to blocking events
    const blockingEvents = filterBlockingEvents(allRawEvents);
    console.log(`[debug] ${blockingEvents.length} blocking events after filter`);
    
    // Test expansion for September 29, 2025
    const requestedDate = new Date('2025-09-29T00:00:00.000Z');
    const expandedEvents = expandEventsForDay(blockingEvents, requestedDate);
    
    console.log(`[debug] ${expandedEvents.length} expanded events for Sept 29`);
    
    // Find events containing "Exam"
    const examExpandedEvents = expandedEvents.filter((e: any) => e.summary?.includes('Exam'));
    console.log(`[debug] Exam events after expansion:`, examExpandedEvents.map(e => ({
      summary: e.summary,
      start: e.start,
      end: e.end
    })));
    
    res.json({
      totalRawEvents: allRawEvents.length,
      blockingEvents: blockingEvents.length,
      expandedEvents: expandedEvents.length,
      examEventFound: !!examEvent,
      examEventDetails: examEvent ? {
        summary: examEvent.summary,
        start: examEvent.start,
        end: examEvent.end,
        blocking: examEvent.blocking,
        isRecurring: examEvent.isRecurring,
        rrule: examEvent.rrule
      } : null,
      examExpandedEvents: examExpandedEvents
    });
    
  } catch (error) {
    console.error('[debug] Error:', error);
    res.status(500).json({ error: 'Debug test failed', details: error });
  }
});

export { router };