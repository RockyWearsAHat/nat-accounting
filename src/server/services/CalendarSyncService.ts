import { SyncTokenModel, ISyncToken } from "../models/SyncToken";
import { CachedEventModel, ICachedEvent } from "../models/CachedEvent";
import { Document } from "mongoose";
import { CalendarConfigModel } from "../models/CalendarConfig";
import { DAVClient, DAVNamespace } from "tsdav";
import { google } from "googleapis";
import { parseICalEvents } from "../routes/icloud";
import dayjs from "dayjs";

// Type for sync token with MongoDB _id
type ISyncTokenDoc = ISyncToken & Document & { _id: any };

interface SyncResult {
  provider: string;
  calendarId: string;
  success: boolean;
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  duration: number;
  error?: string;
}

export class CalendarSyncService {
  private static instance: CalendarSyncService;
  private isSyncing = false;
  
  static getInstance(): CalendarSyncService {
    if (!CalendarSyncService.instance) {
      CalendarSyncService.instance = new CalendarSyncService();
    }
    return CalendarSyncService.instance;
  }

  /**
   * Sync all active calendars using their sync tokens
   */
  async syncAllCalendars(): Promise<SyncResult[]> {
    if (this.isSyncing) {
      console.log("Sync already in progress, skipping");
      return [];
    }

    this.isSyncing = true;
    const results: SyncResult[] = [];

    try {
      // Get all active sync tokens
      const syncTokens = await SyncTokenModel.find({ 
        isActive: true,
        isSyncing: { $ne: true },
        $or: [
          { nextSyncAt: { $exists: false } },
          { nextSyncAt: { $lte: new Date() } }
        ]
      });

      console.log(`Starting sync for ${syncTokens.length} calendars`);

      // Sync calendars in parallel (with concurrency limit)
      const concurrency = 3; // Don't overwhelm APIs
      for (let i = 0; i < syncTokens.length; i += concurrency) {
        const batch = syncTokens.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(
          batch.map(token => this.syncCalendar(token))
        );
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            const token = batch[index];
            results.push({
              provider: token.provider,
              calendarId: token.calendarId,
              success: false,
              eventsAdded: 0,
              eventsUpdated: 0,
              eventsDeleted: 0,
              duration: 0,
              error: result.reason?.message || 'Unknown error'
            });
          }
        });
      }

      console.log(`Sync completed. Results:`, results);
      return results;

    } catch (error) {
      console.error("Sync all calendars failed:", error);
      return [];
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync a single calendar using its sync token
   */
  private async syncCalendar(syncToken: ISyncTokenDoc): Promise<SyncResult> {
    const startTime = Date.now();
    let eventsAdded = 0;
    let eventsUpdated = 0;
    let eventsDeleted = 0;

    try {
      // Mark as syncing
      await SyncTokenModel.updateOne(
        { _id: syncToken._id },
        { isSyncing: true }
      );

      let result: SyncResult;

      if (syncToken.provider === 'icloud') {
        result = await this.syncICloudCalendar(syncToken);
      } else if (syncToken.provider === 'google') {
        result = await this.syncGoogleCalendar(syncToken);
      } else {
        throw new Error(`Unsupported provider: ${syncToken.provider}`);
      }

      // Update sync token with success
      await SyncTokenModel.updateOne(
        { _id: syncToken._id },
        {
          $set: {
            lastSyncAt: new Date(),
            syncErrors: 0,
            lastError: undefined,
            lastErrorAt: undefined,
            isSyncing: false,
            syncDuration: Date.now() - startTime,
            nextSyncAt: new Date(Date.now() + 5 * 60 * 1000) // Next sync in 5 minutes
          }
        }
      );

      return result;

    } catch (error) {
      console.error(`Sync failed for ${syncToken.provider}:${syncToken.calendarId}:`, error);

      // Update sync token with error
      const errorCount = syncToken.syncErrors + 1;
      const backoffMinutes = Math.min(errorCount * 5, 60); // Exponential backoff up to 1 hour

      await SyncTokenModel.updateOne(
        { _id: syncToken._id },
        {
          $set: {
            syncErrors: errorCount,
            lastError: error instanceof Error ? error.message : String(error),
            lastErrorAt: new Date(),
            isSyncing: false,
            nextSyncAt: new Date(Date.now() + backoffMinutes * 60 * 1000)
          }
        }
      );

      return {
        provider: syncToken.provider,
        calendarId: syncToken.calendarId,
        success: false,
        eventsAdded: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Sync iCloud calendar using CalDAV sync tokens
   */
  private async syncICloudCalendar(syncToken: ISyncTokenDoc): Promise<SyncResult> {
    const client = new DAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: {
        username: process.env.ICLOUD_USERNAME!,
        password: process.env.ICLOUD_PASSWORD!
      },
      defaultAccountType: "caldav"
    });

    await client.login();

    let eventsAdded = 0;
    let eventsUpdated = 0;
    let eventsDeleted = 0;

    // For iCloud, we use the sync-collection REPORT for incremental sync
    const syncQuery = syncToken.syncToken 
      ? `<d:sync-collection xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
           <d:sync-token>${syncToken.syncToken}</d:sync-token>
           <d:sync-level>1</d:sync-level>
           <d:prop>
             <d:getetag/>
             <c:calendar-data/>
           </d:prop>
         </d:sync-collection>`
      : null;

    // For now, skip incremental sync and do full sync
    // TODO: Implement proper CalDAV sync-collection REPORT
    if (syncQuery) {
      console.log("Skipping incremental sync for now, doing full sync instead");
    }
    
    // Full sync approach
    await client.login();
    const calendars = await client.fetchCalendars();
    
    const targetCalendar = calendars.find(cal => cal.url === syncToken.calendarUrl);
    if (!targetCalendar) {
      throw new Error(`Calendar not found: ${syncToken.calendarUrl}`);
    }
    
    const calendarObjects = await client.fetchCalendarObjects({
      calendar: targetCalendar
    });
    
    const parsedEvents = parseICalEvents(calendarObjects, 
      dayjs().subtract(1, 'month').toDate(),
      dayjs().add(6, 'months').toDate()
    );

    console.log(`iCloud sync found ${parsedEvents.length} events`);

    // Update cached events
    for (const event of parsedEvents) {
      const existingEvent = await CachedEventModel.findOne({
        eventId: event.uid,
        provider: 'icloud'
      });

      // Extract RRULE from raw iCal data if it's a recurring event
      let rruleString: string | undefined;
      let isRecurring = false;
      if (event.raw && event.isRecurring) {
        const rruleMatch = event.raw.match(/RRULE:(.+)/);
        if (rruleMatch) {
          rruleString = rruleMatch[1].trim();
          isRecurring = true;
          console.log(`[sync] Found RRULE for "${event.summary}": ${rruleString ? rruleString.substring(0, 50) : 'undefined'}...`);
        }
      }

      if (existingEvent) {
        // Update existing event
        await CachedEventModel.updateOne(
          { _id: existingEvent._id },
          {
            title: event.summary || 'Untitled Event',
            start: new Date(event.start),
            end: event.end ? new Date(event.end) : undefined,
            allDay: false, // parseICalEvents doesn't return allDay
            description: undefined, // parseICalEvents doesn't return description
            recurring: isRecurring,
            rrule: rruleString,
            raw: event.raw,
            lastModified: new Date(),
            syncedAt: new Date()
          }
        );
        eventsUpdated++;
      } else {
        // Create new event
        await CachedEventModel.create({
          eventId: event.uid,
          calendarId: syncToken.calendarId,
          provider: 'icloud',
          title: event.summary || 'Untitled Event',
          start: new Date(event.start),
          end: event.end ? new Date(event.end) : undefined,
          allDay: false,
          description: undefined,
          recurring: isRecurring,
          rrule: rruleString,
          raw: event.raw,
          lastModified: new Date(),
          syncedAt: new Date(),
          blocking: true,
          deleted: false
        });
        eventsAdded++;
      }
    }

    // Update sync token (in a real implementation, this would come from CalDAV response headers)
    // For now, just update the last sync time
    await SyncTokenModel.updateOne(
      { _id: syncToken._id },
      { $set: { lastSyncAt: new Date() } }
    );

    return {
      provider: 'icloud',
      calendarId: syncToken.calendarId,
      success: true,
      eventsAdded,
      eventsUpdated,
      eventsDeleted,
      duration: 0 // Will be set by caller
    };
  }

  /**
   * Sync Google calendar using sync tokens
   */
  private async syncGoogleCalendar(syncToken: ISyncTokenDoc): Promise<SyncResult> {
    // This would implement Google Calendar API sync with sync tokens
    // Google Calendar API supports incremental sync with syncToken parameter
    
    const calendar = google.calendar('v3');
    
    // Use sync token for incremental sync
    const params: any = {
      calendarId: syncToken.calendarId,
      maxResults: 2500,
      singleEvents: true,
      timeMin: dayjs().subtract(1, 'year').toISOString(),
      timeMax: dayjs().add(2, 'years').toISOString()
    };

    if (syncToken.syncToken) {
      params.syncToken = syncToken.syncToken;
    }

    try {
      const response = await calendar.events.list(params);
      
      let eventsAdded = 0;
      let eventsUpdated = 0;
      let eventsDeleted = 0;

      if (response.data.items) {
        for (const event of response.data.items) {
          if (event.status === 'cancelled') {
            // Mark event as deleted
            await CachedEventModel.updateOne(
              { eventId: event.id!, provider: 'google' },
              { 
                $set: { 
                  deleted: true, 
                  deletedAt: new Date(),
                  syncedAt: new Date()
                }
              }
            );
            eventsDeleted++;
            continue;
          }

          const existingEvent = await CachedEventModel.findOne({
            eventId: event.id!,
            provider: 'google'
          });

          const cachedEvent: Partial<ICachedEvent> = {
            eventId: event.id!,
            calendarId: syncToken.calendarId,
            provider: 'google',
            title: event.summary || 'Untitled Event',
            start: new Date(event.start?.dateTime || event.start?.date!),
            end: event.end ? new Date(event.end.dateTime || event.end.date!) : undefined,
            allDay: !event.start?.dateTime,
            description: event.description ?? undefined,
            location: event.location ?? undefined,
            lastModified: new Date(event.updated!),
            syncedAt: new Date(),
            etag: event.etag ?? undefined,
            blocking: true,
            deleted: false
          };

          if (existingEvent) {
            await CachedEventModel.updateOne(
              { _id: existingEvent._id },
              { $set: cachedEvent }
            );
            eventsUpdated++;
          } else {
            await CachedEventModel.create(cachedEvent);
            eventsAdded++;
          }
        }
      }

      // Update sync token
      if (response.data.nextSyncToken) {
        await SyncTokenModel.updateOne(
          { _id: syncToken._id },
          { $set: { syncToken: response.data.nextSyncToken } }
        );
      }

      return {
        provider: 'google',
        calendarId: syncToken.calendarId,
        success: true,
        eventsAdded,
        eventsUpdated,
        eventsDeleted,
        duration: 0
      };

    } catch (error) {
      console.error("Google Calendar sync error:", error);
      throw error;
    }
  }

  /**
   * Initialize sync tokens for discovered calendars
   */
  async initializeSyncTokens(): Promise<void> {
    try {
      console.log("Initializing sync tokens for discovered calendars...");
      
      // Discover calendars directly from iCloud (like the /config endpoint does)
      const { getIcloudCreds } = await import("../routes/icloud");
      const creds = getIcloudCreds();
      
      if (!creds.username || !creds.password) {
        console.log("No iCloud credentials available for sync token initialization");
        return;
      }

      const client = new DAVClient({
        serverUrl: "https://caldav.icloud.com",
        credentials: creds,
        authMethod: "Basic",
        defaultAccountType: "caldav",
      });

      await client.login();
      const calendars = await client.fetchCalendars();
      console.log(`Found ${calendars.length} iCloud calendars for sync token initialization`);

      // Create or update sync tokens for each discovered calendar
      for (const calendar of calendars) {
        const calendarId = calendar.displayName || calendar.url.split('/').pop() || 'unknown';
        
        await SyncTokenModel.updateOne(
          { 
            provider: 'icloud',
            calendarId: calendarId
          },
          {
            $setOnInsert: {
              provider: 'icloud',
              calendarId: calendarId,
              calendarUrl: calendar.url,
              lastSyncAt: new Date(0), // Force initial sync
              lastFullSyncAt: new Date(0),
              isActive: true,
              isSyncing: false,
              syncErrors: 0,
              totalEvents: 0,
              lastEventCount: 0
            }
          },
          { upsert: true }
        );

        console.log(`Initialized sync token for: ${calendarId} (${calendar.url})`);
      }

      console.log("Sync tokens initialized successfully");
    } catch (error) {
      console.error("Failed to initialize sync tokens:", error);
    }
  }

  /**
   * Force full resync of all calendars (clears sync tokens)
   */
  async forceFullResync(): Promise<void> {
    await SyncTokenModel.updateMany(
      {},
      {
        $unset: { syncToken: 1, pageToken: 1, etag: 1 },
        $set: { 
          lastSyncAt: new Date(0),
          lastFullSyncAt: new Date(0),
          syncErrors: 0
        }
      }
    );
    console.log("Forced full resync - all sync tokens cleared");
  }
}

export const syncService = CalendarSyncService.getInstance();