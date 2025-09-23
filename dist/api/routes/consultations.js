import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";
import { buildEstimate } from "../estimation";
import { ConsultationModel } from "../mongo";
import { randomUUID } from "crypto";
const router = Router();
const consultationSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(5),
    company: z.string().min(1),
    website: z
        .string()
        .url()
        .optional()
        .or(z.literal(""))
        .transform((v) => v || undefined),
    revenueApprox: z.number().optional(),
    dunsNumber: z.string().optional(),
    numberOfSubsidiaries: z.number().int().nonnegative().optional(),
    transactionsPerMonth: z.number().int().nonnegative().optional(),
    reconciliationAccounts: z.number().int().nonnegative().optional(),
    wantsBookkeeping: z.boolean().optional(),
    wantsReconciliations: z.boolean().optional(),
    wantsFinancials: z.boolean().optional(),
    wantsSoftwareImplementation: z.boolean().optional(),
    wantsAdvisory: z.boolean().optional(),
    wantsAR: z.boolean().optional(),
    wantsAP: z.boolean().optional(),
    wantsCleanup: z.boolean().optional(),
    wantsForecasting: z.boolean().optional(),
    wantsWebsiteHelp: z.boolean().optional(),
    goals: z.string().optional(),
});
// simple in-memory fallback if no DB
const mem = [];
router.post("/", async (req, res) => {
    const parse = consultationSchema.safeParse(req.body);
    if (!parse.success)
        return res.status(400).json({ error: parse.error.flatten() });
    const data = parse.data;
    const internalEstimate = buildEstimate(data);
    const stored = {
        ...data,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        internalEstimate,
    };
    try {
        if (process.env.MONGODB_URI) {
            await new ConsultationModel({ data, internalEstimate }).save();
        }
        else {
            mem.push(stored);
        }
    }
    catch (e) {
        console.error("Persist error", e);
    }
    // TODO: trigger async email + scheduling pipeline
    res.status(201).json({
        ok: true,
        id: stored.id,
        message: "Consultation received. We will reach out shortly.",
    });
});
router.get("/admin", requireAuth, async (req, res) => {
    if (req.user?.role !== "admin")
        return res.status(403).json({ error: "forbidden" });
    let list = [];
    if (process.env.MONGODB_URI) {
        const docs = await ConsultationModel.find().sort({ createdAt: -1 }).lean();
        list = docs.map((d) => ({
            id: d._id.toString(),
            createdAt: d.createdAt.toISOString(),
            ...d.data,
            internalEstimate: d.internalEstimate,
        }));
    }
    else {
        list = [...mem].reverse();
    }
    res.json({ count: list.length, consultations: list });
});
export { router };
