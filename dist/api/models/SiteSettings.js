import mongoose from "mongoose";
const siteSettingsSchema = new mongoose.Schema({
    timezone: {
        type: String,
        default: "America/Denver", // Mountain Time (Utah)
        required: true,
    },
    businessName: {
        type: String,
        default: "Nat's Accounting",
    },
    businessHours: {
        type: mongoose.Schema.Types.Mixed,
        default: {
            monday: { start: "09:00", end: "17:00", enabled: true },
            tuesday: { start: "09:00", end: "17:00", enabled: true },
            wednesday: { start: "09:00", end: "17:00", enabled: true },
            thursday: { start: "09:00", end: "17:00", enabled: true },
            friday: { start: "09:00", end: "17:00", enabled: true },
            saturday: { start: "09:00", end: "17:00", enabled: true },
            sunday: { start: "09:00", end: "17:00", enabled: false },
        },
    },
    bufferMinutes: {
        type: Number,
        default: 0, // No buffer by default
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});
// Ensure only one settings document exists
siteSettingsSchema.index({}, { unique: true, sparse: true });
export const SiteSettingsModel = mongoose.models.SiteSettings ||
    mongoose.model("SiteSettings", siteSettingsSchema);
