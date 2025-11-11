import mongoose from "mongoose";
import type { Db } from "mongodb";

// Don't queue ops while disconnected – fail fast instead of 10s buffer timeout
mongoose.set("bufferCommands", false);

// Singleton connection cache
let cachedConnection: typeof mongoose | null = null;
let connecting: Promise<typeof mongoose> | null = null; // in-flight promise

/**
 * Connect to MongoDB using a singleton pattern.
 * Reuses existing connections and handles concurrent connection attempts.
 * Optimized for serverless environments (Netlify Functions).
 */
export async function connectDB() {
  // ✅ Reuse when connected or still connecting
  if (cachedConnection && cachedConnection.connection.readyState === 1) {
    console.log("[MongoDB] Reusing existing connection");
    return cachedConnection;
  }

  if (connecting) {
    console.log("[MongoDB] Awaiting in-flight connection");
    return connecting; // awaiting the ongoing connect()
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "[MongoDB] MONGODB_URI environment variable is not defined"
    );
  }

  try {
    console.log("[MongoDB] Establishing new connection...");
    connecting = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 5, // Limit connections for serverless (reduced from 10)
        minPoolSize: 1, // Maintain at least 1 connection
        socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
        maxIdleTimeMS: 30000, // Close idle connections after 30s
        family: 4, // Use IPv4, skip trying IPv6
      })
      .then((conn) => {
        console.log(
          `[MongoDB] ✅ Connected successfully. Active connections: ${conn.connections.length}`
        );
        cachedConnection = conn;
        connecting = null;
        return conn;
      })
      .catch((err) => {
        console.error("[MongoDB] ❌ Connection failed:", err);
        connecting = null; // allow retry
        throw err;
      });

    return await connecting;
  } catch (error) {
    console.error("[MongoDB] Database connection error:", error);
    cachedConnection = null;
    connecting = null;
    throw error;
  }
}

/**
 * Disconnect from MongoDB (primarily for graceful shutdown)
 */
export async function disconnectDB() {
  try {
    if (cachedConnection) {
      await cachedConnection.disconnect();
      console.log("[MongoDB] Database connection closed");
      cachedConnection = null;
      connecting = null;
    }
  } catch (error) {
    console.error("[MongoDB] Error closing database connection:", error);
  }
}

/**
 * Get the native MongoDB database instance for GridFS and other operations
 */
export function getDb(): Db {
  if (!mongoose.connection.db) {
    throw new Error("MongoDB not connected. Call connectDB() first.");
  }
  // Type cast to handle version mismatch between mongoose's mongodb and our mongodb package
  return mongoose.connection.db as any as Db;
}

/**
 * Legacy alias for backward compatibility
 * @deprecated Use connectDB() instead
 */
export const connect = connectDB;
