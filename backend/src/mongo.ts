import mongoose from "mongoose";

let connected = false;

export async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("MONGODB_URI not set; using in-memory fallback store only.");
    return;
  }
  if (connected) return;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  } catch (e) {
    console.error("Mongo connection error", e);
    return; // fallback to in-memory
  }
  connected = true;
  console.log("Mongo connected");
}

const ConsultationSchema = new mongoose.Schema({
  data: { type: Object, required: true },
  internalEstimate: { type: Object },
  createdAt: { type: Date, default: Date.now },
});

export const ConsultationModel =
  mongoose.models.Consultation ||
  mongoose.model("Consultation", ConsultationSchema);

// Singleton calendar configuration persistence
const CalendarConfigSchema = new mongoose.Schema({
  busyCalendars: { type: [String], default: [] },
  whitelistUIDs: { type: [String], default: [] },
  busyEventUIDs: { type: [String], default: [] },
  calendarColors: { type: Object, default: {} }, // url -> hex color
  updatedAt: { type: Date, default: Date.now },
});

export const CalendarConfigModel =
  mongoose.models.CalendarConfig ||
  mongoose.model("CalendarConfig", CalendarConfigSchema);

// Site-wide settings
const SiteSettingsSchema = new mongoose.Schema({
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
    type: Object,
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

export const SiteSettingsModel =
  mongoose.models.SiteSettings ||
  mongoose.model("SiteSettings", SiteSettingsSchema);

// Google OAuth credential storage (single-admin context)
const GoogleTokensSchema = new mongoose.Schema({
  refreshToken: { type: String, required: true },
  accessToken: { type: String },
  expiryDate: { type: Date },
  scope: { type: String },
  tokenType: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const GoogleTokensModel =
  (mongoose.models as any).GoogleTokens ||
  mongoose.model("GoogleTokens", GoogleTokensSchema);
