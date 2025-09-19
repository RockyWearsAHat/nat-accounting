import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { connect as connectMongo, SiteSettingsModel } from "../mongo.js";
const router = Router();
router.use(requireAuth); // all settings routes require authenticated user
function requireAdmin(req, res, next) {
    if (req.user?.role !== "admin")
        return res.status(403).json({ error: "forbidden" });
    next();
}
// Get site settings
router.get("/", async (_req, res) => {
    try {
        await connectMongo();
        let settings = await SiteSettingsModel.findOne();
        if (!settings) {
            // Create default settings if none exist
            settings = await SiteSettingsModel.create({});
        }
        res.json({
            ok: true,
            settings: {
                timezone: settings.timezone,
                businessName: settings.businessName,
                businessHours: settings.businessHours,
            },
        });
    }
    catch (error) {
        console.error("Failed to load site settings:", error);
        res.status(500).json({ error: "failed_to_load_settings" });
    }
});
// Update site settings (admin only)
router.post("/", requireAdmin, async (req, res) => {
    try {
        const { timezone, businessName, businessHours } = req.body;
        await connectMongo();
        let settings = await SiteSettingsModel.findOne();
        if (!settings) {
            settings = new SiteSettingsModel();
        }
        if (timezone)
            settings.timezone = timezone;
        if (businessName)
            settings.businessName = businessName;
        if (businessHours)
            settings.businessHours = businessHours;
        settings.updatedAt = new Date();
        await settings.save();
        res.json({
            ok: true,
            settings: {
                timezone: settings.timezone,
                businessName: settings.businessName,
                businessHours: settings.businessHours,
            },
        });
    }
    catch (error) {
        console.error("Failed to update site settings:", error);
        res.status(500).json({ error: "failed_to_update_settings" });
    }
});
// Get list of available timezones
router.get("/timezones", (_req, res) => {
    const commonTimezones = [
        { value: "America/New_York", label: "Eastern Time (ET)" },
        { value: "America/Chicago", label: "Central Time (CT)" },
        { value: "America/Denver", label: "Mountain Time (MT)" },
        { value: "America/Phoenix", label: "Mountain Time (AZ)" },
        { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
        { value: "America/Anchorage", label: "Alaska Time (AKT)" },
        { value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
        { value: "UTC", label: "UTC" },
    ];
    res.json({ ok: true, timezones: commonTimezones });
});
export default router;
