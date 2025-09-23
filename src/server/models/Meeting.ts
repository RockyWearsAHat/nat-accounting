import mongoose from "mongoose";

const MeetingSchema = new mongoose.Schema({
  consultationId: { type: String, index: true, required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  provider: { type: String },
  joinUrl: { type: String },
  status: {
    type: String,
    enum: ["scheduled", "cancelled", "completed"],
    default: "scheduled",
  },
  createdAt: { type: Date, default: Date.now },
});

export const MeetingModel =
  mongoose.models.Meeting || mongoose.model("Meeting", MeetingSchema);
