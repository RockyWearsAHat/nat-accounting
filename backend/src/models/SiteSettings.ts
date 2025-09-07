import mongoose from "mongoose";

interface ISiteSettings {
  timezone: string;
  businessName: string;
  businessHours: {
    [day: string]: { start: string; end: string; enabled: boolean };
  };
  updatedAt: Date;
}

const siteSettingsSchema = new mongoose.Schema<ISiteSettings>({
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
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure only one settings document exists
siteSettingsSchema.index({}, { unique: true, sparse: true });

export const SiteSettingsModel = mongoose.model<ISiteSettings>(
  "SiteSettings",
  siteSettingsSchema
);

export type { ISiteSettings };
