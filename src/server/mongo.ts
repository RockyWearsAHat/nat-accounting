import mongoose from "mongoose";
import type { Db } from "mongodb";

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

/**
 * Get the native MongoDB database instance for GridFS and other operations
 */
export function getDb(): Db {
  if (!mongoose.connection.db) {
    throw new Error("MongoDB not connected. Call connect() first.");
  }
  // Type cast to handle version mismatch between mongoose's mongodb and our mongodb package
  return mongoose.connection.db as any as Db;
}

// ...existing connection logic...
// Import models from individual files
// Note: Models imported directly in route files
// Only database connection logic below
