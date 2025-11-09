import mongoose from "mongoose";

export interface ICachedEvent {
  // Event identification
  eventId: string;           // Unique event ID from calendar provider
  calendarId: string;        // Calendar this event belongs to
  provider: 'icloud' | 'google' | 'local'; // Calendar provider
  
  // Event data
  title: string;
  start: Date;
  end?: Date;
  allDay: boolean;
  description?: string;
  location?: string;
  url?: string;             // Video meeting URL (from iCal URL field)
  color?: string;
  
  // Metadata for sync management
  lastModified: Date;        // When event was last modified in source calendar
  syncedAt: Date;           // When we last synced this event
  etag?: string;            // ETag from calendar provider for change detection
  
  // UI properties
  blocking: boolean;        // Whether this event blocks scheduling
  recurring?: boolean;      // Whether this is a recurring event
  recurringEventId?: string; // Parent event ID for recurring instances
  rrule?: string;           // Raw RRULE string for recurring events
  raw?: string;             // Original iCal data for parsing DTSTART timezone info
  
  // Soft delete support
  deleted: boolean;         // Mark as deleted instead of removing from DB  
  deletedAt?: Date;
}

const cachedEventSchema = new mongoose.Schema<ICachedEvent>({
  eventId: { type: String, required: true },
  calendarId: { type: String, required: true },
  provider: { type: String, enum: ['icloud', 'google', 'local'], required: true },
  
  title: { type: String, required: true },
  start: { type: Date, required: true },
  end: { type: Date },
  allDay: { type: Boolean, default: false },
  description: { type: String },
  location: { type: String },
  url: { type: String },        // Video meeting URL
  color: { type: String },
  
  lastModified: { type: Date, required: true },
  syncedAt: { type: Date, default: Date.now },
  etag: { type: String },
  
  blocking: { type: Boolean, default: true },
  recurring: { type: Boolean, default: false },
  recurringEventId: { type: String },
  rrule: { type: String }, // Raw RRULE string for recurring events
  raw: { type: String }, // Original iCal data for parsing DTSTART timezone info
  
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, {
  timestamps: true
});

// Create indexes
cachedEventSchema.index({ eventId: 1, provider: 1 }, { unique: true });
cachedEventSchema.index({ calendarId: 1 });
cachedEventSchema.index({ start: 1, end: 1 });
cachedEventSchema.index({ syncedAt: 1 });
cachedEventSchema.index({ deleted: 1 });
cachedEventSchema.index({ provider: 1, lastModified: 1 });
cachedEventSchema.index({ recurring: 1 }); // Fast lookup for RRULE events
cachedEventSchema.index({ blocking: 1 }); // Fast lookup for blocking events

// TTL index to automatically clean up old deleted events after 30 days
cachedEventSchema.index({ deletedAt: 1 }, { 
  expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
  partialFilterExpression: { deleted: true }
});

export const CachedEventModel =
  mongoose.models.CachedEvent ||
  mongoose.model<ICachedEvent>("CachedEvent", cachedEventSchema);