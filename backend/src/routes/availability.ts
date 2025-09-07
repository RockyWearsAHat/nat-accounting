import { Router } from "express";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import type { AvailabilitySlot } from "../types.js";
import { listMeetings } from "../scheduling.js";

const router = Router();

router.get("/", async (req, res) => {
  const dateStr = req.query.date as string | undefined;
  const date = dateStr ? dayjs(dateStr) : dayjs();
  if (!date.isValid()) return res.status(400).json({ error: "invalid date" });

  const hoursPath = path.join(process.cwd(), "hoursOfOperation.json");
  const hoursRaw = JSON.parse(fs.readFileSync(hoursPath, "utf-8")) as Record<
    string,
    string
  >;
  const weekday = date.format("dddd").toLowerCase();
  const hours = hoursRaw[weekday];
  if (!hours)
    return res.json({
      date: date.format("YYYY-MM-DD"),
      slots: [],
      openMinutes: null,
      closeMinutes: null,
    });
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
  if (parts.length !== 2)
    return res.json({
      date: date.format("YYYY-MM-DD"),
      slots: [],
      openMinutes: null,
      closeMinutes: null,
    });
  const openMinutes = toMinutes(parts[0]);
  const closeMinutes = toMinutes(parts[1]);
  if (openMinutes == null || closeMinutes == null)
    return res.json({
      date: date.format("YYYY-MM-DD"),
      slots: [],
      openMinutes: null,
      closeMinutes: null,
    });
  let start = dayjs(date).startOf("day").add(openMinutes, "minute");
  let end = dayjs(date).startOf("day").add(closeMinutes, "minute");
  const slots: AvailabilitySlot[] = [];
  const slotLengthMins = 30;
  const existing = await listMeetings();
  // Fetch blocking iCloud events (if admin session connected) to mark conflicts.
  let externalEvents: { start: string; end?: string }[] = [];
  try {
    const resp = await fetch(
      `http://localhost:${
        process.env.PORT || 3000
      }/api/icloud/all?days=1&blockingOnly=1`,
      {
        headers: { cookie: req.headers.cookie || "" },
      }
    );
    if (resp.ok) {
      const json: any = await resp.json();
      externalEvents = (json.events || []).map((e: any) => ({
        start: e.start,
        end: e.end,
      }));
    }
  } catch {}

  while (
    start.add(slotLengthMins, "minute").isBefore(end) ||
    start.add(slotLengthMins, "minute").isSame(end)
  ) {
    const s = start;
    const e = start.add(slotLengthMins, "minute");
    const overlapInternal = existing.some((m) => {
      if (m.status !== "scheduled") return false;
      const ms = dayjs(m.start);
      const me = dayjs(m.end);
      return s.isBefore(me) && e.isAfter(ms);
    });
    const overlapExternal = externalEvents.some((ev) => {
      const evStart = dayjs(ev.start);
      const evEnd = dayjs(ev.end || ev.start);
      return s.isBefore(evEnd) && e.isAfter(evStart);
    });
    slots.push({
      start: s.toISOString(),
      end: e.toISOString(),
      available: !(overlapInternal || overlapExternal),
    });
    start = e;
  }
  res.json({
    date: date.format("YYYY-MM-DD"),
    slots,
    openMinutes,
    closeMinutes,
  });
});

export default router;
