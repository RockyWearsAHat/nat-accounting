import mongoose from "mongoose";

let connected = false;

export async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("MONGODB_URI not set; using in-memory fallback store only.");
    return;
  }
  if (connected) return;
  await mongoose.connect(uri);
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
