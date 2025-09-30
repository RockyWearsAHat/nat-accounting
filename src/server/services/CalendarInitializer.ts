import { CachedEventModel } from "../models/CachedEvent";
import { SyncTokenModel } from "../models/SyncToken";

export async function initializeCalendarCache() {
  console.log("🚀 Initializing calendar cache on server start...");
  
  try {
    // Step 1: Clear existing cache for fresh start
    const deletedEvents = await CachedEventModel.deleteMany({});
    const deletedTokens = await SyncTokenModel.deleteMany({});
    console.log(`✅ Cleared ${deletedEvents.deletedCount} existing events and ${deletedTokens.deletedCount} sync tokens`);

    // Step 2: Fetch ALL iCloud events (no date restrictions)
    await populateAllICloudEvents();
    
    // Step 3: Create sync tokens for discovered calendars
    await createSyncTokens();
    
    console.log("✅ Calendar cache initialization complete!");
    
  } catch (error) {
    console.error("❌ Calendar cache initialization failed:", error);
    // Don't throw - let server continue even if cache init fails
  }
}

async function populateAllICloudEvents() {
  console.log("📅 Fetching ALL iCloud events (no date restrictions)...");
  
  try {
    // Import and use the iCloud router functions directly
    const { fetchAndCacheEvents } = await import("../routes/icloud");
    
    // Fetch events for a very wide date range to get ALL events
    const fromDate = new Date('1900-01-01');
    const toDate = new Date('2100-12-31');
    
    console.log(`📅 Fetching events from ${fromDate.toISOString()} to ${toDate.toISOString()}`);
    
    // This will use the existing iCloud fetch logic
    const events = await fetchAndCacheEvents(fromDate, toDate, "init_cache");
    
    console.log(`📝 Found ${events.length} events from iCloud API`);
    
    if (events.length === 0) {
      console.log("⚠️ No events returned from iCloud API");
      return;
    }
    
    // Convert events to MongoDB format for bulk insert
    const eventsForMongo = events.map(event => ({
      eventId: event.uid || `icloud_${Date.now()}_${Math.random().toString(36)}`,
      calendarId: event.calendar || 'unknown',
      provider: 'icloud',
      title: event.summary || 'Untitled Event',
      start: new Date(event.start),
      end: event.end ? new Date(event.end) : undefined,
      allDay: event.allDay || false,
      description: event.description,
      color: event.color,
      lastModified: new Date(),
      syncedAt: new Date(),
      blocking: event.blocking !== false, // Default to blocking unless explicitly false
      recurring: event.isRecurring || false,
      rrule: event.raw && event.raw.includes('RRULE:') 
        ? event.raw.split('RRULE:')[1]?.split('\r\n')[0] // Extract RRULE string
        : undefined,
      deleted: false
    }));

    // Bulk insert all events at once
    try {
      const result = await CachedEventModel.insertMany(eventsForMongo, { 
        ordered: false // Continue inserting even if some fail (e.g., duplicates)
      });
      console.log(`✅ Saved ${result.length} events to MongoDB cache using bulk insert`);
    } catch (bulkError) {
      // Handle bulk insert errors (likely duplicates)
      if (bulkError instanceof Error && bulkError.message.includes('duplicate key')) {
        console.log(`⚠️ Some duplicate events were skipped during bulk insert`);
        // Count successful inserts from bulk error
        const insertedCount = (bulkError as any).result?.result?.nInserted || 0;
        console.log(`✅ Successfully saved ${insertedCount} events to MongoDB cache`);
      } else {
        console.error(`❌ Bulk insert failed:`, bulkError);
        throw bulkError;
      }
    }
    
  } catch (error) {
    console.error("❌ Failed to populate iCloud events:", error);
    throw error;
  }
}

async function createSyncTokens() {
  console.log("🔄 Creating sync tokens for discovered calendars...");
  
  try {
    // Get unique calendar IDs from cached events
    const uniqueCalendars = await CachedEventModel.distinct('calendarId', { 
      provider: 'icloud',
      deleted: false 
    });
    
    console.log(`📚 Found ${uniqueCalendars.length} unique iCloud calendars`);
    
    // Create sync token for each calendar
    for (const calendarId of uniqueCalendars) {
      const eventCount = await CachedEventModel.countDocuments({
        calendarId,
        provider: 'icloud',
        deleted: false
      });
      
      await SyncTokenModel.create({
        provider: 'icloud',
        calendarId,
        calendarUrl: calendarId, // For iCloud, calendarId is the URL
        lastSyncAt: new Date(),
        lastFullSyncAt: new Date(),
        isActive: true,
        isSyncing: false,
        syncErrors: 0,
        totalEvents: eventCount,
        lastEventCount: eventCount
      });
      
      console.log(`✅ Created sync token for calendar: ${calendarId} (${eventCount} events)`);
    }
    
    console.log(`🎉 Created ${uniqueCalendars.length} sync tokens`);
    
  } catch (error) {
    console.error("❌ Failed to create sync tokens:", error);
    throw error;
  }
}

export async function startBackgroundSync() {
  console.log("🔄 Starting background sync service...");
  
  // Run sync every 5 minutes
  const syncInterval = setInterval(async () => {
    try {
      console.log("🔄 Running background sync...");
      
      // Get all sync tokens
      const syncTokens = await SyncTokenModel.find({ 
        isActive: true,
        isSyncing: false 
      });

      console.log(`🔄 Found ${syncTokens.length} calendars for sync...`);
      
      // For now, just update the lastSyncAt timestamp
      // TODO: Implement incremental sync using CalDAV sync tokens
      await SyncTokenModel.updateMany(
        { isActive: true },
        { $set: { lastSyncAt: new Date() } }
      );
      
      console.log("✅ Background sync completed");
      
    } catch (error) {
      console.error("❌ Background sync failed:", error);
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Return cleanup function
  return () => {
    console.log("🛑 Stopping background sync...");
    clearInterval(syncInterval);
  };
}