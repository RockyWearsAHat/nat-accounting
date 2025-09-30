import mongoose from "mongoose";

export interface ISyncToken {
  // Sync token identification
  provider: 'icloud' | 'google';
  calendarId: string;       // Calendar identifier from provider
  calendarUrl?: string;     // Full calendar URL (for iCloud CalDAV)
  
  // Sync tokens for incremental updates
  syncToken?: string;       // Main sync token from provider
  pageToken?: string;       // Page token for Google Calendar pagination
  etag?: string;           // ETag for change detection
  
  // Sync metadata
  lastSyncAt: Date;        // When we last successfully synced
  lastFullSyncAt: Date;    // When we last did a full sync (not incremental)
  nextSyncAt?: Date;       // When to attempt next sync (for rate limiting)
  
  // Error handling
  syncErrors: number;      // Consecutive sync error count
  lastError?: string;      // Last sync error message
  lastErrorAt?: Date;      // When last error occurred
  
  // Status tracking
  isActive: boolean;       // Whether this calendar should be synced
  isSyncing: boolean;      // Whether sync is currently in progress
  
  // Statistics
  totalEvents: number;     // Total events in this calendar
  lastEventCount: number;  // Event count from last sync
  syncDuration?: number;   // Last sync duration in milliseconds
}

const syncTokenSchema = new mongoose.Schema<ISyncToken>({
  provider: { type: String, enum: ['icloud', 'google'], required: true },
  calendarId: { type: String, required: true },
  calendarUrl: { type: String },
  
  syncToken: { type: String },
  pageToken: { type: String },
  etag: { type: String },
  
  lastSyncAt: { type: Date, default: Date.now },
  lastFullSyncAt: { type: Date, default: Date.now },
  nextSyncAt: { type: Date },
  
  syncErrors: { type: Number, default: 0 },
  lastError: { type: String },
  lastErrorAt: { type: Date },
  
  isActive: { type: Boolean, default: true },
  isSyncing: { type: Boolean, default: false },
  
  totalEvents: { type: Number, default: 0 },
  lastEventCount: { type: Number, default: 0 },
  syncDuration: { type: Number }
}, {
  timestamps: true
});

// Create indexes
syncTokenSchema.index({ provider: 1, calendarId: 1 }, { unique: true });
syncTokenSchema.index({ lastSyncAt: 1 });
syncTokenSchema.index({ nextSyncAt: 1 });
syncTokenSchema.index({ isActive: 1 });
syncTokenSchema.index({ isSyncing: 1 });

export const SyncTokenModel = mongoose.model<ISyncToken>("SyncToken", syncTokenSchema);