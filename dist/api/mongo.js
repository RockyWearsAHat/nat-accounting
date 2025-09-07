import mongoose from "mongoose";
let connected = false;
export async function connect() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.warn("MONGODB_URI not set; using in-memory fallback store only.");
        return;
    }
    if (connected)
        return;
    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    }
    catch (e) {
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
export const ConsultationModel = mongoose.models.Consultation ||
    mongoose.model("Consultation", ConsultationSchema);
// Singleton calendar configuration persistence
const CalendarConfigSchema = new mongoose.Schema({
    busyCalendars: { type: [String], default: [] },
    whitelistUIDs: { type: [String], default: [] },
    busyEventUIDs: { type: [String], default: [] },
    calendarColors: { type: Object, default: {} }, // url -> hex color
    updatedAt: { type: Date, default: Date.now },
});
export const CalendarConfigModel = mongoose.models.CalendarConfig ||
    mongoose.model("CalendarConfig", CalendarConfigSchema);
