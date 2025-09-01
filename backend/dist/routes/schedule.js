import { Router } from "express";
import { z } from "zod";
import dayjs from "dayjs";
import { isSlotAvailable, scheduleMeeting, listMeetings, cancelMeeting, } from "../scheduling.js";
const router = Router();
const bodySchema = z.object({
    consultationId: z.string().uuid(),
    start: z.string().datetime(),
    end: z.string().datetime(),
});
router.post("/", (req, res) => {
    const parse = bodySchema.safeParse(req.body);
    if (!parse.success)
        return res.status(400).json({ error: parse.error.flatten() });
    const { consultationId, start, end } = parse.data;
    if (!isSlotAvailable(start, end))
        return res.status(409).json({ error: "slot_unavailable" });
    const startD = dayjs(start);
    const endD = dayjs(end);
    if (!startD.isValid() || !endD.isValid() || !endD.isAfter(startD))
        return res.status(400).json({ error: "invalid_range" });
    const duration = endD.diff(startD, "minute");
    if (duration !== 30)
        return res.status(400).json({ error: "must_be_30_min_slot" });
    const meeting = scheduleMeeting(consultationId, start, end);
    res.status(201).json({ ok: true, meeting });
});
router.get("/admin", (req, res) => {
    const key = req.header("x-api-key");
    if (!key || key !== process.env.ADMIN_API_KEY)
        return res.status(401).json({ error: "unauthorized" });
    res.json({ meetings: listMeetings() });
});
router.post("/:id/cancel", (req, res) => {
    const key = req.header("x-api-key");
    if (!key || key !== process.env.ADMIN_API_KEY)
        return res.status(401).json({ error: "unauthorized" });
    const ok = cancelMeeting(req.params.id);
    if (!ok)
        return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
});
export default router;
