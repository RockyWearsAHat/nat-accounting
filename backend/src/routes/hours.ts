import { Router } from "express";
import fs from "fs";
import path from "path";

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

router.get("/", (_req, res) => {
  try {
    const file = path.join(process.cwd(), "hoursOfOperation.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<
      string,
      string
    >;
    const parsed: Record<string, DayHours> = {};
    for (const [day, span] of Object.entries(raw)) {
      const p = parseSpan(span);
      if (!p) continue;
      parsed[day.toLowerCase()] = { raw: span, ...p };
    }
    res.json({ ok: true, hours: parsed });
  } catch (e) {
    res.status(500).json({ error: "failed_to_read_hours" });
  }
});

export default router;
