/**
 * Meetings API Routes
 * Handle meeting management for scheduled appointments
 */

import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { CachedEventModel, ICachedEvent } from "../models/CachedEvent";
import { zoomService } from "../services/ZoomService";
import { DAVClient } from "tsdav";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import type { Types } from "mongoose";

dayjs.extend(utc);
dayjs.extend(timezone);

const router = Router();

type LeanCachedEvent = ICachedEvent & {
  _id: Types.ObjectId;
  __v?: number;
  uid?: string;
  id?: string;
  rawData?: string;
  summary?: string;
};

// Debug endpoint to see what events exist
router.get("/debug-events", requireAuth, async (req, res) => {
  try {
    const now = dayjs().utc();
    // Get all events, not just future ones
    const allEvents = await CachedEventModel
      .find({})
      .sort({ start: -1 })
      .limit(10)
      .lean<LeanCachedEvent[]>();

    const uniqueCalendarIds = [...new Set(allEvents.map(e => e.calendarId))];
    
    return res.json({
      totalEvents: allEvents.length,
      uniqueCalendarIds,
      sampleEvents: allEvents.slice(0, 5).map(event => ({
        title: event.title,
        calendarId: event.calendarId,
        provider: event.provider,
        start: event.start,
        hasLocation: !!event.location,
        hasDescription: !!event.description,
        locationSnippet: (event.location || '').substring(0, 50),
        descriptionSnippet: (event.description || '').substring(0, 100)
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to extract video URL from event
const extractVideoUrl = (event: any): string => {
  // Check URL field first
  if (event.url) return event.url;
  
  // Check description for common video meeting patterns
  const description = event.description || '';
  const zoomMatch = description.match(/https?:\/\/[^\s]*zoom[^\s]*/i);
  if (zoomMatch) return zoomMatch[0];
  
  const meetMatch = description.match(/https?:\/\/meet\.google\.com\/[^\s]*/i);
  if (meetMatch) return meetMatch[0];
  
  const teamsMatch = description.match(/https?:\/\/teams\.microsoft\.com\/[^\s]*/i);
  if (teamsMatch) return teamsMatch[0];
  
  return '';
};

// Helper function to extract client name from event custom properties
const extractClientName = (event: any): string => {
  // Check for X-CLIENT-NAME custom property in raw event data
  const rawData = event.rawData || event.raw || '';
  if (typeof rawData === 'string') {
    const clientNameMatch = rawData.match(/X-CLIENT-NAME:(.+)/i);
    if (clientNameMatch) {
      return clientNameMatch[1].trim();
    }
  }
  
  // Fallback: try to extract from summary using various patterns
  const summary = event.title || event.summary || '';
  
  // Pattern: "Appointment with [Name]"
  const appointmentMatch = summary.match(/^Appointment with (.+)$/i);
  if (appointmentMatch) {
    return appointmentMatch[1].trim();
  }
  
  // Pattern: "Consultation for [Company Name]"
  const consultationMatch = summary.match(/^Consultation for (.+)$/i);
  if (consultationMatch) {
    return consultationMatch[1].trim();
  }
  
  // Pattern: "Meeting with [Name]"
  const meetingMatch = summary.match(/^Meeting with (.+)$/i);
  if (meetingMatch) {
    return meetingMatch[1].trim();
  }
  
  // Pattern: "[Name] (appt|appointment|meeting|consultation)"
  const nameFirstMatch = summary.match(/^(.+?)\s+(appt|appointment|meeting|consultation)/i);
  if (nameFirstMatch) {
    return nameFirstMatch[1].trim();
  }
  
  return '';
};

interface ScheduledMeeting {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  videoUrl?: string;
  zoomMeetingId?: string;
  clientName?: string;
  clientEmail?: string;
  provider: string;
  calendar: string;
  status: 'scheduled' | 'cancelled' | 'completed';
}

/**
 * Get all scheduled meetings
 * GET /api/meetings/scheduled
 */
// Debug endpoint to check database directly
router.get("/debug/:meetingId", requireAuth, async (req, res) => {
  try {
    const { meetingId } = req.params;
    console.log('[Meetings API] Debug - searching for:', meetingId);
    
    // Try multiple search strategies
    const byEventId = await CachedEventModel.findOne({ eventId: meetingId }).lean<LeanCachedEvent | null>();
    const byId = await CachedEventModel.findOne({ id: meetingId }).lean<LeanCachedEvent | null>();
    const byLike = await CachedEventModel.findOne({ 
      eventId: { $regex: meetingId.replace('@', '\\@') } 
    }).lean<LeanCachedEvent | null>();
    
    return res.json({
      meetingId,
      byEventId: byEventId ? { eventId: byEventId.eventId, title: byEventId.title } : null,
      byId: byId ? { eventId: byId.eventId, title: byId.title } : null,
      byLike: byLike ? { eventId: byLike.eventId, title: byLike.title } : null
    });
  } catch (error: any) {
    console.error('[Meetings API] Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});


router.get("/scheduled", requireAuth, async (req, res) => {
  try {
    console.log('[Meetings API] Fetching scheduled meetings...');
    
    const now = dayjs().utc();
    const pastWeek = now.subtract(7, 'days'); // Include past week for past meetings
    const endDate = now.add(1, 'year'); // Look ahead 1 year
    
    // Get events from past week to future (no need to filter deleted since we fully delete now)
    const allEvents = await CachedEventModel.find({
      start: { $gte: pastWeek.toDate() }
    }).sort({ start: 1 }).lean<LeanCachedEvent[]>();
    
    // Filter to Business calendar events only - this is where all scheduled appointments are written
  const appointmentEvents = (allEvents as LeanCachedEvent[]).filter((event: LeanCachedEvent) => {
      // Skip all-day events
      if (event.allDay) return false;
      
      const calendarId = event.calendarId || '';
      
      // ONLY include events from the Business calendar
      // All scheduled appointments should be written to this calendar
      return calendarId === 'Business';
    });

  const meetings: ScheduledMeeting[] = appointmentEvents.map((event: LeanCachedEvent) => {
      // Try to extract client info from title/description
      const clientName = extractClientName(event);
      const clientEmail = extractClientEmail(event.description || '');
      
      // Look for video URL in description or location
      const videoUrl = extractVideoUrl(event);
      const zoomMeetingId = extractZoomMeetingId(event.description || '', event.location || '');
      
      return {
        id: event.eventId || `${Date.now()}-${Math.random()}`,
        summary: event.title || 'Untitled Meeting',
        description: event.description || '',
        start: event.start.toISOString(),
        end: event.end ? event.end.toISOString() : event.start.toISOString(),
        location: event.location || '',
        videoUrl,
        zoomMeetingId,
        clientName,
        clientEmail,
        provider: event.provider,
        calendar: event.calendarId || 'Business',
        status: 'scheduled' as const
      };
    });

    res.json({
      success: true,
      meetings,
      total: meetings.length
    });

  } catch (error: any) {
    console.error('[Meetings API] Error fetching scheduled meetings:', error);
    res.status(500).json({
      error: "Failed to fetch scheduled meetings",
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Get all requested meetings (consultation requests)
 * GET /api/meetings/requested
 */
router.get("/requested", requireAuth, async (req, res) => {
  try {
    // For now, return empty array since consultation requests don't automatically 
    // create meetings - they would need to be manually converted
    const requestedMeetings: any[] = [];

    res.json({
      success: true,
      meetings: requestedMeetings,
      total: requestedMeetings.length
    });

  } catch (error: any) {
    console.error('[Meetings API] Error fetching requested meetings:', error);
    res.status(500).json({
      error: "Failed to fetch requested meetings"
    });
  }
});

// ===== HELPER FUNCTIONS =====

// Helper function to delete event from Google Calendar
async function deleteFromGoogle(eventId: string, calendarId: string): Promise<void> {
  // Import Google Calendar service
  const { google } = await import('googleapis');
  
  // Get credentials from environment
  const credentials = {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  };

  if (!credentials.client_id || !credentials.client_secret || !credentials.refresh_token) {
    throw new Error('Missing Google Calendar credentials');
  }

  // Set up OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  oauth2Client.setCredentials({
    refresh_token: credentials.refresh_token,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Delete the event
  await calendar.events.delete({
    calendarId: calendarId,
    eventId: eventId,
  });
}

// Helper function to delete event from iCloud
async function deleteFromICloud(eventId: string): Promise<void> {
  function getIcloudCreds() {
    const appleId = process.env.APPLE_ID;
    const appPassword = process.env.APPLE_APP_PASSWORD;
    if (!appleId || !appPassword) {
      throw new Error("Missing APPLE_ID or APPLE_APP_PASSWORD environment variables");
    }
    return { appleId, appPassword };
  }

  const creds = getIcloudCreds();
  
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
  
  const businessCalendar = calendars.find((c) => c.displayName === "Business");
  if (!businessCalendar) {
    throw new Error("Business calendar not found");
  }

  // Construct the event URL for deletion
  const eventUrl = businessCalendar.url.endsWith('/') 
    ? businessCalendar.url + eventId + '.ics'
    : businessCalendar.url + '/' + eventId + '.ics';

  // Delete the event using CalDAV DELETE
  const response = await fetch(eventUrl, {
    method: 'DELETE',
    headers: {
      'Authorization': "Basic " + Buffer.from(creds.appleId + ":" + creds.appPassword).toString("base64"),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete from iCloud: ${response.status} ${response.statusText}`);
  }
}

// Helper function to extract client email from description
function extractClientEmail(description: string): string {
  // Try to extract email from description
  const emailMatch = description.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return emailMatch ? emailMatch[1] : '';
}

function extractZoomMeetingId(description: string, location: string): string {
  // Try to extract Zoom meeting ID from description or location
  const text = `${description} ${location}`;
  
  // Look for various Zoom ID patterns
  const patterns = [
    /Meeting ID:\s*([0-9\s-]+)/i,
    /Zoom ID:\s*([0-9\s-]+)/i,
    /ID:\s*([0-9\s-]+)/i,
    /zoom\.us\/j\/([0-9]+)/i,
    /([0-9]{9,11})/  // Direct 9-11 digit number (common Zoom ID length)
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Clean up the ID (remove spaces and dashes)
      const cleanId = match[1].replace(/[\s-]/g, '');
      // Validate it looks like a Zoom meeting ID (9-11 digits)
      if (/^[0-9]{9,11}$/.test(cleanId)) {
        return cleanId;
      }
    }
  }

  return '';
}

// ===== GENERIC ROUTES (MUST BE LAST) =====

/**
 * Get meeting details
 * GET /api/meetings/:meetingId
 */
router.get("/:meetingId", requireAuth, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const event = await CachedEventModel.findOne({
      eventId: meetingId
    }).lean<LeanCachedEvent | null>();

    if (!event) {
      return res.status(404).json({
        error: "Meeting not found"
      });
    }

    const meeting: ScheduledMeeting = {
      id: event.eventId || event._id.toString(),
      summary: event.title || 'Untitled Meeting',
      description: event.description || '',
      start: event.start.toISOString(),
      end: event.end ? event.end.toISOString() : event.start.toISOString(),
      location: event.location || '',
      videoUrl: extractVideoUrl(event),
      zoomMeetingId: extractZoomMeetingId(event.description || '', event.location || ''),
      clientName: extractClientName(event),
      clientEmail: extractClientEmail(event.description || ''),
      provider: event.provider,
      calendar: event.calendarId || 'Business',
      status: 'scheduled'
    };

    res.json({
      success: true,
      meeting
    });

  } catch (error: any) {
    console.error('[Meetings API] Error fetching meeting:', error);
    res.status(500).json({
      error: "Failed to fetch meeting details"
    });
  }
});

/**
 * Cancel/Delete a meeting - FULLY removes from source calendar and cache
 * DELETE /api/meetings/:meetingId
 */
router.delete("/:meetingId", requireAuth, async (req, res) => {
  try {
    const { meetingId } = req.params;
    console.log('[Meetings API] Attempting to delete meeting:', meetingId);

    // Use multiple search strategies to find the event
    // Try exact eventId match first
    let event = await CachedEventModel.findOne({
      eventId: meetingId
    }).lean<LeanCachedEvent | null>();

    // If not found, try uid field (common in calendar events)  
    if (!event) {
      event = await CachedEventModel.findOne({
        uid: meetingId
      }).lean<LeanCachedEvent | null>();
    }

    // Try searching within eventId with @ symbol handling (common in iCloud)
    if (!event) {
      event = await CachedEventModel.findOne({
        eventId: { $regex: meetingId.replace('@', '\\@') }
      }).lean<LeanCachedEvent | null>();
    }

    // Try MongoDB _id as last resort
    if (!event && meetingId.match(/^[0-9a-fA-F]{24}$/)) {
  event = await CachedEventModel.findById(meetingId).lean<LeanCachedEvent | null>();
    }

    console.log('[Meetings API] Event found:', event ? `${event.title} (${event.eventId})` : 'Not found');

    if (!event) {
      return res.status(404).json({
        error: "Meeting not found",
        searchedId: meetingId
      });
    }

    // If it has a Zoom meeting, delete that too
    const zoomMeetingId = extractZoomMeetingId(event.description || '', event.location || '');
    if (zoomMeetingId) {
      try {
        await zoomService.deleteMeeting(zoomMeetingId);
        console.log('[Meetings API] Deleted Zoom meeting:', zoomMeetingId);
      } catch (zoomError) {
        console.warn('[Meetings API] Failed to delete Zoom meeting:', zoomError);
        // Continue with calendar event deletion even if Zoom fails
      }
    }

    // Delete from actual calendar provider (iCloud/Google) FIRST
    if (event.provider === 'icloud') {
      try {
        await deleteFromICloud(event.eventId);
        console.log('[Meetings API] Successfully deleted from iCloud:', event.eventId);
      } catch (icloudError) {
        console.error('[Meetings API] Failed to delete from iCloud:', icloudError);
        // Still proceed with cache deletion - the event may be orphaned
      }
    } else if (event.provider === 'google') {
      try {
        await deleteFromGoogle(event.eventId, event.calendarId);
        console.log('[Meetings API] Successfully deleted from Google:', event.eventId);
      } catch (googleError) {
        console.error('[Meetings API] Failed to delete from Google:', googleError);
        // Still proceed with cache deletion - the event may be orphaned
      }
    }

    // Fully delete from cache (complete removal, not soft delete)
    await CachedEventModel.deleteOne({ _id: event._id });

    console.log('[Meetings API] Successfully deleted meeting:', event.title);

    res.json({
      success: true,
      message: "Meeting cancelled successfully",
      deletedEvent: {
        id: event.eventId,
        title: event.title
      }
    });

  } catch (error: any) {
    console.error('[Meetings API] Error cancelling meeting:', error);
    res.status(500).json({
      error: "Failed to cancel meeting"
    });
  }
});

export default router;