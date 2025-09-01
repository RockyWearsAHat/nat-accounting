import { Router } from "express";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import { listMeetings } from "../scheduling.js";
const router = Router();
router.get("/", async (req, res) => {
    const dateStr = req.query.date;
    const date = dateStr ? dayjs(dateStr) : dayjs();
    if (!date.isValid())
        return res.status(400).json({ error: "invalid date" });
    const hoursPath = path.join(process.cwd(), "hoursOfOperation.json");
    const hoursRaw = JSON.parse(fs.readFileSync(hoursPath, "utf-8"));
    const weekday = date.format("dddd").toLowerCase();
    const hours = hoursRaw[weekday];
    if (!hours)
        return res.json({ date: date.toISOString(), slots: [] });
    const [startStr, endStr] = hours.split("-").map((s) => s.trim());
    const parseTime = (t) => dayjs(date.format("YYYY-MM-DD ") + t.replace(/(am|pm)/i, " $1"));
    // naive parse; improve later
    let start = dayjs(date.format("YYYY-MM-DD") + "T09:00:00");
    let end = dayjs(date.format("YYYY-MM-DD") + "T17:00:00");
    if (/am|pm/i.test(startStr) && /am|pm/i.test(endStr)) {
        // TODO: robust 12h parsing
    }
    const slots = [];
    const slotLengthMins = 30;
    const existing = await listMeetings();
    while (start.add(slotLengthMins, "minute").isBefore(end) || start.add(slotLengthMins, "minute").isSame(end)) {
        const s = start;
        const e = start.add(slotLengthMins, "minute");
        const overlap = existing.some((m) => m.status === 'scheduled' &&
            !(e.isSame(dayjs(m.start)) || e.isBefore(dayjs(m.start))) &&
            !(s.isSame(dayjs(m.end)) || s.isAfter(dayjs(m.end))) &&
            s.isBefore(dayjs(m.end)) &&
            e.isAfter(dayjs(m.start)));
        slots.push({
            start: s.toISOString(),
            end: e.toISOString(),
            available: !overlap,
        });
        start = e;
    }
    res.json({ date: date.format("YYYY-MM-DD"), slots });
});
export default router;
