/**
 * Zoom API Routes
 * Handle Zoom meeting creation and management
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { zoomService } from "../services/ZoomService";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const router = Router();

/**
 * Create a new Zoom meeting
 * POST /api/zoom/create-meeting
 */
router.post("/create-meeting", requireAuth, async (req, res) => {
  try {
    const { topic, startTime, duration, agenda, timezone = "America/Denver" } = req.body;

    // Validate required fields
    if (!topic || !startTime || !duration) {
      return res.status(400).json({
        error: "Missing required fields: topic, startTime, duration"
      });
    }

    // Parse and validate start time
    const startDateTime = dayjs(startTime);
    if (!startDateTime.isValid()) {
      return res.status(400).json({
        error: "Invalid startTime format. Use ISO string format."
      });
    }

    // Validate duration
    const durationNum = parseInt(duration, 10);
    if (isNaN(durationNum) || durationNum < 1 || durationNum > 600) {
      return res.status(400).json({
        error: "Duration must be between 1 and 600 minutes"
      });
    }

    console.log('[Zoom API] Creating meeting request:', {
      topic,
      startTime,
      duration: durationNum,
      timezone,
      user: req.user?.email
    });

    // Create the meeting
    const result = await zoomService.createMeeting({
      topic,
      startTime: startDateTime.toDate(),
      duration: durationNum,
      agenda,
      timezone
    });

    if (!result.success) {
      return res.status(500).json({
        error: result.error || "Failed to create Zoom meeting"
      });
    }

    // Return meeting details
    res.json({
      success: true,
      meeting: {
        id: result.meeting!.id,
        topic: result.meeting!.topic,
        start_time: result.meeting!.start_time,
        duration: result.meeting!.duration,
        timezone: result.meeting!.timezone,
        join_url: result.meeting!.join_url,
        password: result.meeting!.password,
        agenda: result.meeting!.agenda
      }
    });

  } catch (error: any) {
    console.error('[Zoom API] Error creating meeting:', error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

/**
 * Delete a Zoom meeting
 * DELETE /api/zoom/meeting/:meetingId
 */
router.delete("/meeting/:meetingId", requireAuth, async (req, res) => {
  try {
    const { meetingId } = req.params;

    if (!meetingId) {
      return res.status(400).json({
        error: "Meeting ID is required"
      });
    }

    console.log('[Zoom API] Deleting meeting:', meetingId, 'by user:', req.user?.email);

    const result = await zoomService.deleteMeeting(meetingId);

    if (!result.success) {
      return res.status(500).json({
        error: result.error || "Failed to delete Zoom meeting"
      });
    }

    res.json({
      success: true,
      message: "Meeting deleted successfully"
    });

  } catch (error: any) {
    console.error('[Zoom API] Error deleting meeting:', error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

/**
 * Get Zoom meeting details
 * GET /api/zoom/meeting/:meetingId
 */
router.get("/meeting/:meetingId", requireAuth, async (req, res) => {
  try {
    const { meetingId } = req.params;

    if (!meetingId) {
      return res.status(400).json({
        error: "Meeting ID is required"
      });
    }

    const result = await zoomService.getMeeting(meetingId);

    if (!result.success) {
      return res.status(404).json({
        error: result.error || "Meeting not found"
      });
    }

    res.json({
      success: true,
      meeting: {
        id: result.meeting!.id,
        topic: result.meeting!.topic,
        start_time: result.meeting!.start_time,
        duration: result.meeting!.duration,
        timezone: result.meeting!.timezone,
        join_url: result.meeting!.join_url,
        password: result.meeting!.password,
        status: result.meeting!.status
      }
    });

  } catch (error: any) {
    console.error('[Zoom API] Error getting meeting:', error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

/**
 * Check Zoom API configuration status
 * GET /api/zoom/status
 */
router.get("/status", requireAuth, async (req, res) => {
  const isConfigured = zoomService.isConfigured();
  
  res.json({
    configured: isConfigured,
    message: isConfigured 
      ? "Zoom API is properly configured"
      : "Zoom API credentials not configured. Set ZOOM_API_KEY and ZOOM_API_SECRET environment variables."
  });
});

export default router;