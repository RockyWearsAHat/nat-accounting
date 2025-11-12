import { Router } from "express";
import { BusinessHoursModel } from "../models/BusinessHours.js";
import { requireAdmin } from "../middleware/auth.js";

interface DayHours {
  raw: string;
  startMinutes: number; // minutes from 00:00
  endMinutes: number; // minutes from 00:00
}

function parseSpan(
  span: string
): { startMinutes: number; endMinutes: number } | null {
  // Expect formats like "9am - 5pm" or "09:00 - 17:30" (case-insensitive)
  const parts = span.split(/-/).map((p) => p.trim());
  if (parts.length !== 2) return null;
  const toMinutes = (s: string): number | null => {
    s = s.toLowerCase();
    const ampmMatch = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10);
      const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
      const period = ampmMatch[3];
      if (h === 12) h = 0; // 12am -> 0, 12pm handled later
      if (period === "pm") h += 12;
      if (period === "am" && h === 24) h = 0;
      return h * 60 + m;
    }
    const twentyFour = s.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (twentyFour) {
      const h = parseInt(twentyFour[1], 10);
      const m = twentyFour[2] ? parseInt(twentyFour[2], 10) : 0;
      if (h > 23 || m > 59) return null;
      return h * 60 + m;
    }
    return null;
  };
  const start = toMinutes(parts[0]);
  const end = toMinutes(parts[1]);
  if (start == null || end == null) return null;
  return { startMinutes: start, endMinutes: end };
}

const router = Router();

// GET /api/hours - Get business hours (public endpoint)
router.get("/", async (_req, res) => {
  try {
    const hours = await BusinessHoursModel.find().sort({ dayOfWeek: 1 }).lean();

    // If no hours in database, return default hours
    if (!hours || hours.length === 0) {
      const defaultHours: Record<string, DayHours> = {
        monday: { raw: "7am - 5pm", startMinutes: 420, endMinutes: 1020 },
        tuesday: { raw: "9am - 5pm", startMinutes: 540, endMinutes: 1020 },
        wednesday: { raw: "7am - 5pm", startMinutes: 420, endMinutes: 1020 },
        thursday: { raw: "9am - 6pm", startMinutes: 540, endMinutes: 1080 },
        friday: { raw: "8am - 5pm", startMinutes: 480, endMinutes: 1020 },
        saturday: { raw: "9am - 5pm", startMinutes: 540, endMinutes: 1020 },
        sunday: { raw: "9am - 5pm", startMinutes: 540, endMinutes: 1020 },
      };
      return res.json({ ok: true, hours: defaultHours });
    }

    // Transform to expected format
    const parsed: Record<string, DayHours> = {};
    for (const day of hours) {
      if (day.isClosed) {
        parsed[day.dayOfWeek] = { raw: "Closed", startMinutes: 0, endMinutes: 0 };
      } else {
        parsed[day.dayOfWeek] = {
          raw: day.displayFormat,
          startMinutes: day.startMinutes,
          endMinutes: day.endMinutes,
        };
      }
    }

    res.json({ ok: true, hours: parsed });
  } catch (e) {
    console.error("Error fetching business hours:", e);
    res.status(500).json({ error: "failed_to_read_hours" });
  }
});

// GET /api/hours/admin - Get all business hours with full details (admin only)
router.get("/admin", requireAdmin, async (_req, res) => {
  try {
    const hours = await BusinessHoursModel.find().sort({ dayOfWeek: 1 });
    res.json({ ok: true, hours });
  } catch (error) {
    console.error("Error fetching business hours:", error);
    res.status(500).json({ error: "Failed to fetch business hours" });
  }
});

// PUT /api/hours/admin/:day - Update business hours for a specific day (admin only)
router.put("/admin/:day", requireAdmin, async (req, res) => {
  try {
    const { day } = req.params;
    const { displayFormat, isClosed } = req.body;

    const validDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    if (!validDays.includes(day.toLowerCase())) {
      return res.status(400).json({ error: "Invalid day of week" });
    }

    let updateData: any = {};

    if (isClosed !== undefined) {
      updateData.isClosed = isClosed;
      if (isClosed) {
        // If closed, set default closed values
        updateData.displayFormat = "Closed";
        updateData.openTime = "";
        updateData.closeTime = "";
        updateData.startMinutes = 0;
        updateData.endMinutes = 0;
      }
    }

    if (displayFormat && !isClosed) {
      const parsed = parseSpan(displayFormat);
      if (!parsed) {
        return res.status(400).json({ error: "Invalid time format. Use format like '9am - 5pm'" });
      }

      // Extract open/close times from display format
      const [openTime, closeTime] = displayFormat.split("-").map((t: string) => t.trim());

      updateData = {
        ...updateData,
        displayFormat,
        openTime,
        closeTime,
        startMinutes: parsed.startMinutes,
        endMinutes: parsed.endMinutes,
        isClosed: false,
      };
    }

    const updated = await BusinessHoursModel.findOneAndUpdate(
      { dayOfWeek: day.toLowerCase() },
      updateData,
      { new: true, upsert: true }
    );

    res.json({ ok: true, hours: updated });
  } catch (error) {
    console.error("Error updating business hours:", error);
    res.status(500).json({ error: "Failed to update business hours" });
  }
});

// POST /api/hours/admin/init - Initialize default hours (admin only, one-time use)
router.post("/admin/init", requireAdmin, async (_req, res) => {
  try {
    const existingCount = await BusinessHoursModel.countDocuments();
    if (existingCount > 0) {
      return res.status(400).json({ error: "Business hours already initialized" });
    }

    const defaultHours = [
      { dayOfWeek: "monday", displayFormat: "7am - 5pm", openTime: "7am", closeTime: "5pm", startMinutes: 420, endMinutes: 1020 },
      { dayOfWeek: "tuesday", displayFormat: "9am - 5pm", openTime: "9am", closeTime: "5pm", startMinutes: 540, endMinutes: 1020 },
      { dayOfWeek: "wednesday", displayFormat: "7am - 5pm", openTime: "7am", closeTime: "5pm", startMinutes: 420, endMinutes: 1020 },
      { dayOfWeek: "thursday", displayFormat: "9am - 6pm", openTime: "9am", closeTime: "6pm", startMinutes: 540, endMinutes: 1080 },
      { dayOfWeek: "friday", displayFormat: "8am - 5pm", openTime: "8am", closeTime: "5pm", startMinutes: 480, endMinutes: 1020 },
      { dayOfWeek: "saturday", displayFormat: "9am - 5pm", openTime: "9am", closeTime: "5pm", startMinutes: 540, endMinutes: 1020 },
      { dayOfWeek: "sunday", displayFormat: "9am - 5pm", openTime: "9am", closeTime: "5pm", startMinutes: 540, endMinutes: 1020 },
    ];

    await BusinessHoursModel.insertMany(defaultHours);

    res.json({ ok: true, message: "Business hours initialized successfully" });
  } catch (error) {
    console.error("Error initializing business hours:", error);
    res.status(500).json({ error: "Failed to initialize business hours" });
  }
});

export { router };
