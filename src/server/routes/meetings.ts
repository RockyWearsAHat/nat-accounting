/**
 * Meetings API Routes
 * Handle meeting management for scheduled appointments
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { CachedEventModel } from "../models/CachedEvent";
import { zoomService } from "../services/ZoomService";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const router = Router();

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
router.get("/scheduled", requireAuth, async (req, res) => {
  try {
    // Get current time for filtering
    const now = dayjs().utc();
    const oneYearFromNow = now.add(1, 'year');

    console.log('[Meetings API] Current time:', now.toISOString());
    console.log('[Meetings API] Looking for events between:', now.toISOString(), 'and', oneYearFromNow.toISOString());

    // Find all future meetings from cached events
    // Look for events in Business calendar or events with video URLs (likely meetings)
    const events = await CachedEventModel.find({
      deleted: { $ne: true },
      start: { 
        $gte: now.toDate(),
        $lte: oneYearFromNow.toDate()
      },
      $or: [
        { calendarId: 'Business' },
        { location: { $regex: /zoom\.us|meet\.google\.com|teams\.microsoft\.com/i } },
        { description: { $regex: /zoom\.us|meet\.google\.com|teams\.microsoft\.com/i } }
      ]
    }).sort({ start: 1 }).lean();

    console.log('[Meetings API] Found', events.length, 'events matching criteria');
    
    // Also try a simpler query for debugging
    const businessEvents = await CachedEventModel.find({
      deleted: { $ne: true },
      calendarId: 'Business'
    }).lean();
    
    console.log('[Meetings API] Total Business calendar events:', businessEvents.length);
    if (businessEvents.length > 0) {
      console.log('[Meetings API] Business events:', businessEvents.map(e => ({ title: e.title, start: e.start, calendarId: e.calendarId })));
    }

    const meetings: ScheduledMeeting[] = events.map(event => {
      // Try to extract client info from title/description
      const clientName = extractClientName(event.title || '');
      const clientEmail = extractClientEmail(event.description || '');
      
      // Look for video URL in description or location
      const videoUrl = extractVideoUrl(event.description || '', event.location || '');
      const zoomMeetingId = extractZoomMeetingId(event.description || '', event.location || '');
      
      return {
        id: event.eventId || event._id.toString(),
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
        status: 'scheduled' // TODO: Add status tracking to events
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
      error: "Failed to fetch scheduled meetings"
    });
  }
});

/**
 * Get requested meetings (from consultations)
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

/**
 * Get meeting details
 * GET /api/meetings/:meetingId
 */
router.get("/:meetingId", requireAuth, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const event = await CachedEventModel.findOne({
      $or: [
        { eventId: meetingId },
        { _id: meetingId }
      ],
      deleted: { $ne: true }
    }).lean();

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
      videoUrl: extractVideoUrl(event.description || '', event.location || ''),
      zoomMeetingId: extractZoomMeetingId(event.description || '', event.location || ''),
      clientName: extractClientName(event.title || ''),
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
 * Cancel/Delete a meeting
 * DELETE /api/meetings/:meetingId
 */
router.delete("/:meetingId", requireAuth, async (req, res) => {
  try {
    const { meetingId } = req.params;

    // Find the meeting
    const event = await CachedEventModel.findOne({
      $or: [
        { eventId: meetingId },
        { _id: meetingId }
      ],
      deleted: { $ne: true }
    });

    if (!event) {
      return res.status(404).json({
        error: "Meeting not found"
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

    // Mark as deleted in cache
    await CachedEventModel.updateOne(
      { _id: event._id },
      { deleted: true, deletedAt: new Date() }
    );

    // TODO: Also delete from actual calendar provider (iCloud/Google)
    // This would require calling the appropriate calendar service

    res.json({
      success: true,
      message: "Meeting cancelled successfully"
    });

  } catch (error: any) {
    console.error('[Meetings API] Error cancelling meeting:', error);
    res.status(500).json({
      error: "Failed to cancel meeting"
    });
  }
});

// Helper functions
function extractClientName(summary: string): string {
  // Try to extract client name from meeting summary
  // Common patterns: "Meeting with John Doe", "John Doe - Consultation", "Consultation with ABC Corp"
  const patterns = [
    /(?:meeting|consultation)\s+with\s+(.+?)$/i,
    /^(.+?)\s*[-–—]\s*(?:meeting|consultation|appointment)/i,
    /^(.+?)\s*\(/i, // Name before parentheses
  ];

  for (const pattern of patterns) {
    const match = summary.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // If no pattern matches, return the summary as-is (might be just the client name)
  return summary.replace(/\s*\(.*?\)\s*/g, '').trim();
}

function extractClientEmail(description: string): string {
  // Try to extract email from description
  const emailMatch = description.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return emailMatch ? emailMatch[1] : '';
}

function extractVideoUrl(description: string, location: string): string {
  // Try to extract video URL from description or location
  const text = `${description} ${location}`;
  const urlPatterns = [
    /https:\/\/[a-zA-Z0-9-]+\.zoom\.us\/j\/[0-9]+[^\s]*/i,
    /https:\/\/meet\.google\.com\/[a-z0-9-]+/i,
    /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s]*/i,
    /https:\/\/[^\s]*meet[^\s]*/i
  ];

  for (const pattern of urlPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return '';
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

export default router;