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

// ...existing connection logic...
// Import models from individual files
// Note: Models imported directly in route files
// Only database connection logic below
