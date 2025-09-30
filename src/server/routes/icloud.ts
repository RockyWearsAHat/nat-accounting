import { Router } from "express";
import { DAVClient, createDAVClient, fetchCalendars, fetchCalendarObjects, createAccount, DAVNamespace } from "tsdav";
import rrulePkg from "rrule";
import { requireAuth } from "../middleware/auth";
import { CalendarConfigModel } from "../models/CalendarConfig";
import { getAuthorizedClient } from "./google";
import { google } from "googleapis";
import { connect as connectMongo } from "../mongo";
import { getCache, setIcloudEventCache } from "../cache";

const { rrulestr } = rrulePkg;
const eventCache: Record<string, any[]> = {};

// Register the eventCache with the shared cache system
setIcloudEventCache(eventCache);

function createCacheKey(...args: string[]): string {
  return args.join(":");
}

function getCachedEvents(key: string): any[] | null {
  return eventCache[key] || null;
}

function setCachedEvents(key: string, events: any[]): void {
  eventCache[key] = events;
}

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// Function to normalize hex color from 8-char (#RRGGBBAA) to 6-char (#RRGGBB) format
function normalizeHexColor(color: string): string {
  if (!color || !color.startsWith('#')) return color;
  
  // If it's an 8-character hex code (#RRGGBBAA), strip the alpha channel
  if (color.length === 9) {
    return color.slice(0, 7); // Keep #RRGGBB, remove AA
  }
  
  return color; // Already 6-char format or other format
}

// Function to ensure colors are bright enough and not too dark
function ensureBrightColor(hexColor: string): string {
  if (!hexColor || !hexColor.startsWith('#')) return hexColor;
  
  // Convert hex to RGB
  const hex = hexColor.slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  
  // Calculate perceived brightness using luminance formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  
  // If too dark (brightness < 80), brighten it
  if (brightness < 80) {
    // Convert to HSL and increase lightness
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const diff = max - min;
    
    let h = 0;
    let s = 0;
    let l = (max + min) / 2;
    
    if (diff !== 0) {
      s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
      
      switch (max) {
        case r / 255: h = (g / 255 - b / 255) / diff + (g < b ? 6 : 0); break;
        case g / 255: h = (b / 255 - r / 255) / diff + 2; break;
        case b / 255: h = (r / 255 - g / 255) / diff + 4; break;
      }
      h /= 6;
    }
    
    // Ensure minimum lightness of 50% and good saturation
    l = Math.max(0.5, l);
    s = Math.max(0.6, s);
    
    // Convert back to hex
    h *= 360;
    s *= 100;
    l *= 100;
    
    return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  }
  
  return hexColor;
}

function getIcloudCreds() {
  const creds = {
    username: process.env.APPLE_ID || "",
    password: process.env.APPLE_APP_PASSWORD || "",
  };
  console.log(`[iCloud] Credentials check: username=${creds.username ? 'SET' : 'MISSING'}, password=${creds.password ? 'SET' : 'MISSING'}`);
  return creds;
}

function parseICalDate(val: string): Date {
  console.log(`[parseICalDate] Input: ${val}`);
  
  // Handle date-only format: YYYYMMDD - treat as all-day event
  if (val.match(/^[0-9]{8}$/)) {
    const year = val.slice(0,4);
    const month = val.slice(4,6);
    const day = val.slice(6,8);
    // Create UTC date for all-day events to avoid timezone offset issues
    const result = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    console.log(`[parseICalDate] All-day event: ${result.toISOString()}`);
    return result;
  }
  
  // Handle datetime format: YYYYMMDDTHHMMSS[Z]
  if (val.match(/^[0-9]{8}T[0-9]{6}Z?$/)) {
    const year = parseInt(val.slice(0,4));
    const month = parseInt(val.slice(4,6)) - 1; // JavaScript months are 0-based
    const day = parseInt(val.slice(6,8));
    const hour = parseInt(val.slice(9,11));
    const minute = parseInt(val.slice(11,13));
    const second = parseInt(val.slice(13,15));
    
    // Create date using local time constructor to preserve the exact time
    // This treats the time as if it's already in the correct timezone (Mountain Time)
    const result = new Date(year, month, day, hour, minute, second);
    console.log(`[parseICalDate] Preserved exact time: ${hour}:${minute.toString().padStart(2, '0')} -> ${result.toISOString()}`);
    return result;
  }
  
  // Fallback to native Date parsing
  const result = new Date(val);
  console.log(`[parseICalDate] Fallback: ${result.toISOString()}`);
  return result;
}

export function parseICalEvents(objects: any[], from: Date, to: Date) {
  const events = [];
  
  for (const obj of objects) {
    if (!obj?.data || !obj.data.includes('BEGIN:VEVENT')) continue;
    
    const dtstartMatch = obj.data.match(/DTSTART([^:]*):(.+)/);
    const dtendMatch = obj.data.match(/DTEND([^:]*):(.+)/);
    const uid = obj.data.match(/UID:(.+)/)?.[1]?.split(/\r?\n/)[0].trim() || 'unknown';
    const summary = obj.data.match(/SUMMARY:(.+)/)?.[1]?.split(/\r?\n/)[0].trim() || '';
    const rruleMatch = obj.data.match(/RRULE:(.+)/);
    
    if (!dtstartMatch) continue;
    
    const startTzInfo = dtstartMatch[1];
    const startDateStr = dtstartMatch[2].trim();
    const endTzInfo = dtendMatch ? dtendMatch[1] : startTzInfo;
    const endDateStr = dtendMatch ? dtendMatch[2].trim() : null;
    
    // Parse dates - for timezone awareness, we'll need to handle TZID properly
    let startDate = parseICalDate(startDateStr);
    let endDate = endDateStr ? parseICalDate(endDateStr) : new Date(startDate.getTime() + 30 * 60 * 1000);
    
    // For now, keep dates as parsed - timezone handling can be improved later
    // The current parsing treats local times as if they were UTC, which may be acceptable
    // for scheduling purposes where we mainly care about relative timing
    
    if (isNaN(startDate.getTime())) continue;
    
    const isRecurring = !!rruleMatch;
    
    if (isRecurring && rruleMatch) {
      // Handle recurring events with RRULE expansion
      try {
        const rruleStr = rruleMatch[1].trim();
        const rule = rrulestr(`DTSTART:${startDateStr}\nRRULE:${rruleStr}`);
        const occurrences = rule.between(from, to, true);
        
        const eventDuration = endDate.getTime() - startDate.getTime();
        
        for (const occurrence of occurrences) {
          const occurrenceEnd = new Date(occurrence.getTime() + eventDuration);
          events.push({
            uid: `${uid}_${occurrence.toISOString()}`,
            summary,
            start: occurrence.toISOString(),
            end: occurrenceEnd.toISOString(),
            isRecurring: true,
            raw: obj.data
          });
        }
      } catch (rruleError) {
        console.warn(`[iCloud] RRULE parsing failed for event ${uid}:`, rruleError);
        // Fallback: add the original event if RRULE parsing fails
        if (startDate <= to && endDate >= from) {
          events.push({
            uid,
            summary,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            isRecurring: true,
            raw: obj.data
          });
        }
      }
    } else {
      // Non-recurring event - include ALL non-recurring events regardless of date
      const isInRange = startDate <= to && endDate >= from;
      if (isInRange) {
        events.push({
          uid,
          summary,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          isRecurring: false,
          raw: obj.data
        });
      }
    }
  }
  
  return events;
}

// Function to parse iCal events WITHOUT date filtering - for /all endpoint
function parseICalEventsAll(objects: any[]) {
  const events = [];
  
  console.log(`🚨 [parseICalEventsAll] CALLED! Processing ${objects.length} calendar objects`);
  
  for (const obj of objects) {
    if (!obj?.data || !obj.data.includes('BEGIN:VEVENT')) continue;
    
    const dtstartMatch = obj.data.match(/DTSTART([^:]*):(.+)/);
    const dtendMatch = obj.data.match(/DTEND([^:]*):(.+)/);
    const uid = obj.data.match(/UID:(.+)/)?.[1]?.split(/\r?\n/)[0].trim() || 'unknown';
    const summary = obj.data.match(/SUMMARY:(.+)/)?.[1]?.split(/\r?\n/)[0].trim() || '';
    const rruleMatch = obj.data.match(/RRULE:(.+)/);
    
    if (!dtstartMatch) continue;
    
    const startTzInfo = dtstartMatch[1];
    const startDateStr = dtstartMatch[2].trim();
    const endTzInfo = dtendMatch ? dtendMatch[1] : startTzInfo;
    const endDateStr = dtendMatch ? dtendMatch[2].trim() : null;
    
    // Parse dates
    let startDate = parseICalDate(startDateStr);
    let endDate = endDateStr ? parseICalDate(endDateStr) : new Date(startDate.getTime() + 30 * 60 * 1000);
    
    if (isNaN(startDate.getTime())) continue;
    
    const isRecurring = !!rruleMatch;
    
    // Debug specific events we're looking for
    if (summary.includes('truck') || summary.includes('Stem')) {
      console.log(`[parseICalEventsAll] Found target event: "${summary}"`, {
        startDateStr,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        isRecurring,
        uid
      });
    }
    
    if (isRecurring && rruleMatch) {
      // For recurring events, return the base event with RRULE data for frontend expansion
      const rruleStr = rruleMatch[1].trim();
      events.push({
        uid,
        summary,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        isRecurring: true,
        rrule: rruleStr,
        raw: obj.data
      });
    } else {
      // Non-recurring event - include ALL non-recurring events regardless of date
      events.push({
        uid,
        summary,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        isRecurring: false,
        raw: obj.data
      });
    }
  }
  
  console.log(`[parseICalEventsAll] Parsed ${events.length} events total`);
  return events;
}

// Function to discover iCloud calendars via direct CalDAV PROPFIND
async function discoverIcloudCalendars(credentials: { username: string; password: string }): Promise<any[]> {
  const principalUrl = `https://caldav.icloud.com/${encodeURIComponent(credentials.username)}/calendars/`;
  console.log('[iCloud] Discovering calendars from:', principalUrl);
  
  try {
    const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <c:supported-calendar-component-set/>
  </d:prop>
</d:propfind>`;

    const response = await fetch(principalUrl, {
      method: 'PROPFIND',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`,
        'Content-Type': 'application/xml',
        'Depth': '1',
      },
      body: propfindBody,
    });

    if (!response.ok) {
      throw new Error(`PROPFIND failed: ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();
    console.log('[iCloud] PROPFIND response length:', xmlText.length);
    
    // Extract calendar URLs and names from the XML response
    const calendars: any[] = [];
    const hrefMatches = xmlText.match(/<d:href[^>]*>([^<]+)<\/d:href>/gi) || [];
    
    for (const hrefMatch of hrefMatches) {
      const url = hrefMatch.replace(/<[^>]*>/g, '').trim();
      
      // Skip the principal URL itself, only include calendar collections
      if (url !== principalUrl && url.includes('/calendars/') && !url.endsWith('/calendars/')) {
        // Find the corresponding displayname for this href
        const hrefIndex = xmlText.indexOf(hrefMatch);
        const responseEnd = xmlText.indexOf('</d:response>', hrefIndex);
        const responseSection = xmlText.substring(hrefIndex, responseEnd);
        
        const displayNameMatch = responseSection.match(/<d:displayname[^>]*>([^<]*)<\/d:displayname>/i);
        const displayName = displayNameMatch?.[1]?.trim() || url.split('/').filter(Boolean).pop() || url;
        
        // Check if this is a calendar collection (has calendar resource type)
        if (responseSection.includes('calendar') || url.endsWith('.ics/')) {
          calendars.push({
            url: url.startsWith('http') ? url : `https://caldav.icloud.com${url}`,
            displayName,
          });
        }
      }
    }
    
    console.log(`[iCloud] Discovered ${calendars.length} calendars:`, calendars.map(c => ({ url: c.url, name: c.displayName })));
    return calendars;
  } catch (error) {
    console.error('[iCloud] Calendar discovery error:', error);
    throw error;
  }
}

// Function to fetch calendar display names via PROPFIND
async function fetchCalendarDisplayNames(calendarUrls: string[], credentials: { username: string; password: string }): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  for (let i = 0; i < calendarUrls.length; i++) {
    const url = calendarUrls[i];
    try {
      const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:displayname/></d:prop>
</d:propfind>`;
      
      const res = await fetch(url, {
        method: 'PROPFIND',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`,
          'Content-Type': 'application/xml',
          'Depth': '0',
        },
        body: propfindBody,
      });
      
      if (res.ok) {
        const xml = await res.text();
        const match = xml.match(/<d:displayname[^>]*>([^<]*)<\/d:displayname>/i);
        names[url] = match?.[1].trim() || `Calendar ${i + 1}`;
      } else {
        names[url] = `Calendar ${i + 1}`;
      }
    } catch (e) {
      console.error('[iCloud] fetchCalendarDisplayNames error:', e);
      names[url] = `Calendar ${i + 1}`;
    }
  }
  return names;
}

// Function to fetch and cache iCloud events with direct HTTP requests
export async function fetchAndCacheEvents(from: Date, to: Date, cacheKey: string): Promise<any[]> {
  try {
    const creds = getIcloudCreds();
    if (!creds.username || !creds.password) {
      console.log('[iCloud] Missing credentials');
      return [];
    }

    await connectMongo();
    const config = await CalendarConfigModel.findOne();
    
    // Get calendar URLs to fetch from
    let calendarUrls: string[] = [];
    
    // Use new DAVClient to discover calendars and fetch events
    try {
      const client = new DAVClient({
        serverUrl: "https://caldav.icloud.com",
        credentials: creds,
        authMethod: "Basic",
        defaultAccountType: "caldav",
      });

      await client.login();
      const calendars = await client.fetchCalendars();
      console.log(`[iCloud] Found ${calendars.length} calendars for event fetching`);
      
      // Get events from each calendar using tsdav's fetchCalendarObjects
      const allEvents: any[] = [];
      
      for (const calendar of calendars) {
        try {
          console.log(`[iCloud] Fetching events from calendar: ${calendar.displayName}`);
          
          // For /all endpoint (very wide date range), fetch without time restrictions
          let calendarObjects;
          if (from.getFullYear() === 1900 && to.getFullYear() === 2100) {
            // This is the /all endpoint - fetch everything without time range
            console.log(`[iCloud] Fetching ALL events from calendar: ${calendar.displayName}`);
            calendarObjects = await client.fetchCalendarObjects({
              calendar,
              // No timeRange - fetch everything
            });
          } else {
            // Regular endpoints - use time range filtering
            calendarObjects = await client.fetchCalendarObjects({
              calendar,
              timeRange: {
                start: from.toISOString(),
                end: to.toISOString(),
              },
            });
          }
          
          console.log(`[iCloud] Got ${calendarObjects.length} objects from ${calendar.displayName}`);
          
          // Parse the calendar objects
          let parsedEvents;
          if (from.getFullYear() <= 1900 && to.getFullYear() >= 2100) {
            // For /all endpoint - don't filter by date, include everything
            parsedEvents = parseICalEventsAll(calendarObjects);
          } else {
            // For regular endpoints - filter by date range
            parsedEvents = parseICalEvents(calendarObjects, from, to);
          }
          
          // Add calendar metadata to each event
          const eventsWithMeta = parsedEvents.map(event => {
            const icloudUrl = calendar.url;
            
            // Get proper color with priority: user override > stored color > default based on index
            let calendarColor = '#007AFF'; // Default fallback
            
            // Use stored color if available (should be fetched from CalDAV)
            if (config?.calendarColors?.[icloudUrl]) {
              calendarColor = config.calendarColors[icloudUrl];
              console.log(`[iCloud] Using stored color ${calendarColor} for ${calendar.displayName}`);
            } else {
              // If no stored color, use basic fallback
              console.warn(`[iCloud] No stored color found for ${calendar.displayName}, using fallback`);
              calendarColor = '#007AFF'; // Basic fallback
            }
            
            return {
              ...event,
              calendar: calendar.displayName,
              calendarUrl: icloudUrl,
              calendarId: calendar.url.split('/').pop() || calendar.displayName,
              calendarSource: 'icloud',
              blocking: config?.busyCalendars?.includes(icloudUrl) || false,
              color: calendarColor
            };
          });
          
          allEvents.push(...eventsWithMeta);
          
        } catch (calError) {
          console.error(`[iCloud] Error fetching events from ${calendar.displayName}:`, calError);
        }
      }
      
      // Sort events by start time
      allEvents.sort((a: any, b: any) => a.start.localeCompare(b.start));
      setCachedEvents(cacheKey, allEvents);
      console.log(`[iCloud] Cached ${allEvents.length} total events using DAVClient`);

      return allEvents;
      
    } catch (e) {
      console.error('[iCloud] DAVClient event fetching error:', e);
      return [];
    }
  } catch (error) {
    console.error('[iCloud] Major fetch error:', error);
    return [];
  }
}

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

// GET /api/icloud/config - Return unified calendar configuration for iCloud & Google
router.get("/config", requireAdmin, async (req, res) => {
  console.log('[iCloud] GET /config endpoint hit');
  try {
    await connectMongo();
    
    // Load stored settings
    const configDoc: any = await CalendarConfigModel.findOne() || new CalendarConfigModel();
    const busySet = new Set(configDoc.busyCalendars || []);
    const displayNames: Record<string, string> = configDoc.calendarDisplayNames || {};
    const colors: Record<string, string> = configDoc.calendarColors || {};
    
    // Collect calendar infos
    const infos: Array<{ displayName: string; url: string; busy: boolean; color: string }> = [];
    
    // iCloud calendars - using new DAVClient approach
    try {
      const creds = getIcloudCreds();
      console.log('[iCloud] Credentials check:', { hasUsername: !!creds.username, hasPassword: !!creds.password });
      if (creds.username && creds.password) {
        console.log('[iCloud] Starting iCloud calendar discovery with DAVClient...');
        
        try {
          const client = new DAVClient({
            serverUrl: "https://caldav.icloud.com",
            credentials: creds,
            authMethod: "Basic",
            defaultAccountType: "caldav",
          });

          await client.login();
          
          // First fetch calendars without props to get the basic list
          const calendars = await client.fetchCalendars();
          console.log(`[iCloud] DAVClient found ${calendars.length} calendars`);
          console.log('[iCloud] Calendar URLs:', calendars.map((c: any) => c.url));
          
          // Now fetch colors for each calendar using direct fetch approach
          const calendarColors: Record<string, string> = {};
          for (const cal of calendars) {
            try {
              // Try multiple approaches to get calendar color
              let foundColor = false;
              
              // Method 1: Try using tsdav PROPFIND with Apple namespace
              try {
                const colorResult = await client.propfind({
                  url: cal.url,
                  props: [{ name: "calendar-color", namespace: DAVNamespace.CALDAV_APPLE }],
                  depth: "0"
                });
                
                console.log(`[iCloud] PROPFIND result structure for ${cal.displayName}:`, JSON.stringify(colorResult, null, 2));
                
                if (colorResult && colorResult.length > 0) {
                  const firstResult = colorResult[0];
                  let colorProp = null;
                  
                  console.log(`[iCloud] Full PROPFIND response for ${cal.displayName}:`, JSON.stringify(firstResult, null, 2));
                  
                  // Handle different possible response structures for calendar-color
                  if (firstResult.props) {
                    // Try different property key formats that CalDAV servers use
                    const possibleKeys = [
                      '{http://apple.com/ns/ical/}calendar-color',
                      'calendar-color',
                      'apple:calendar-color',
                      'ical:calendar-color'
                    ];
                    
                    for (const key of possibleKeys) {
                      if (firstResult.props[key]) {
                        colorProp = firstResult.props[key];
                        console.log(`[iCloud] Found color property with key: ${key}`, colorProp);
                        break;
                      }
                    }
                    
                    // If still not found, try searching through all properties
                    if (!colorProp) {
                      const allKeys = Object.keys(firstResult.props);
                      console.log(`[iCloud] Available property keys for ${cal.displayName}:`, allKeys);
                      
                      const colorKey = allKeys.find(key => 
                        key.toLowerCase().includes('calendar-color') ||
                        key.toLowerCase().includes('color')
                      );
                      
                      if (colorKey) {
                        colorProp = firstResult.props[colorKey];
                        console.log(`[iCloud] Found color via search: ${colorKey}`, colorProp);
                      }
                    }
                  }
                  
                  // Extract color value from different possible structures
                  let colorValue = null;
                  if (colorProp?.value && typeof colorProp.value === 'string') {
                    colorValue = colorProp.value;
                  } else if (typeof colorProp === 'string') {
                    colorValue = colorProp;
                  } else if (colorProp?._ && typeof colorProp._ === 'string') {
                    colorValue = colorProp._; // Some XML parsers use underscore for text content
                  }
                  
                  if (colorValue) {
                    const normalizedColor = normalizeHexColor(colorValue.trim());
                    calendarColors[cal.url] = normalizedColor;
                    console.log(`[iCloud] ✅ Found color via PROPFIND: ${colorValue.trim()} -> normalized to ${normalizedColor} for calendar ${cal.displayName}`);
                    foundColor = true;
                  }
                }
              } catch (propfindError) {
                console.warn(`[iCloud] PROPFIND failed for calendar ${cal.displayName}:`, propfindError);
              }
              
              // Method 2: Try direct PROPFIND with raw fetch if tsdav fails
              if (!foundColor) {
                try {
                  const creds = getIcloudCreds();
                  const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:apple="http://apple.com/ns/ical/">
  <d:prop>
    <apple:calendar-color/>
  </d:prop>
</d:propfind>`;

                  const response = await fetch(cal.url, {
                    method: 'PROPFIND',
                    headers: {
                      'Authorization': `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`,
                      'Content-Type': 'application/xml',
                      'Depth': '0',
                    },
                    body: propfindBody,
                  });

                  if (response.ok) {
                    const xmlText = await response.text();
                    console.log(`[iCloud] Raw PROPFIND XML response for ${cal.displayName}:`, xmlText);
                    
                    // Try multiple XML patterns for calendar-color
                    const colorPatterns = [
                      /<apple:calendar-color[^>]*>([^<]+)<\/apple:calendar-color>/i,
                      /<calendar-color[^>]*>([^<]+)<\/calendar-color>/i,
                      /<[^:]*:calendar-color[^>]*>([^<]+)<\/[^:]*:calendar-color>/i,
                      /calendar-color[^>]*>([^<]+)</i
                    ];
                    
                    for (const pattern of colorPatterns) {
                      const colorMatch = xmlText.match(pattern);
                      if (colorMatch && colorMatch[1]) {
                        const rawColor = colorMatch[1].trim();
                        const normalizedColor = normalizeHexColor(rawColor);
                        calendarColors[cal.url] = normalizedColor;
                        console.log(`[iCloud] ✅ Found color via raw PROPFIND (pattern ${pattern}): ${rawColor} -> normalized to ${normalizedColor} for calendar ${cal.displayName}`);
                        foundColor = true;
                        break;
                      }
                    }
                  }
                } catch (rawError) {
                  console.warn(`[iCloud] Raw PROPFIND failed for calendar ${cal.displayName}:`, rawError);
                }
              }
              
              // Method 3: iCloud calendars may not have explicit color properties
              // Leave foundColor as false - we'll use default/stored colors in the priority logic
              if (!foundColor) {
                console.log(`[iCloud] No color property found for calendar ${cal.displayName}, will use default or stored color`);
              }
              
            } catch (colorError) {
              console.warn(`[iCloud] All color methods failed for calendar ${cal.displayName}:`, colorError);
              // Final fallback - use a default color
              calendarColors[cal.url] = '#007AFF';
            }
          }
          
          calendars.forEach((cal: any, index: number) => {
            const url = cal.url;
            const freshName = (cal.displayName as string) || url.split('/').filter(Boolean).pop() || url;
            displayNames[url] = freshName; // Update stored name
            
            // Priority: user override > fetched calendar color > stored color > sensible default
            const fetchedColor = calendarColors[url];
            const isColorOverwritten = configDoc.colorOverwritten?.[url] || false;
            
            let calendarColor = '#007AFF'; // Basic fallback only if everything else fails
            
            if (isColorOverwritten && colors[url]) {
              // Use user's custom color if they've overridden it
              calendarColor = colors[url];
            } else if (fetchedColor) {
              // Use the actual calendar color from iCloud CalDAV
              calendarColor = fetchedColor;
              // Store the fetched color for future reference (but don't mark as overwritten)
              colors[url] = fetchedColor;
            } else if (colors[url]) {
              // Fall back to previously stored color
              calendarColor = colors[url];
            } else {
              // Store the basic fallback color for future reference
              colors[url] = calendarColor; // This is '#007AFF'
            }
            
            infos.push({
              displayName: freshName,
              url,
              busy: busySet.has(url),
              color: calendarColor
            });
          });
          
          console.log(`[iCloud] Added ${calendars.length} iCloud calendars to infos. Total infos: ${infos.length}`);
          
        } catch (davError) {
          console.error('[iCloud] DAVClient failed:', davError);
          
          // Last resort: use stored busyCalendars if available
          if (configDoc.busyCalendars?.length) {
            configDoc.busyCalendars.forEach((url: string) => {
              if (url.startsWith('https://caldav.icloud.com/')) {
                const name = displayNames[url] || url.split('/').filter(Boolean).pop() || url;
                infos.push({
                  displayName: name,
                  url,
                  busy: busySet.has(url),
                  color: colors[url] // Only set color if explicitly configured
                });
              }
            });
          }
        }
      }
    } catch (e) {
      console.error('[iCloud] iCloud calendars error:', e);
    }
    
    // Google calendars
    try {
      const gClient = await getAuthorizedClient((req as any).user.id);
      if (gClient) {
        const gapi = google.calendar({ version: 'v3', auth: gClient });
        const list = await gapi.calendarList.list({ maxResults: 250 });
        (list.data.items || []).forEach((c: any) => {
          const url = `google://${c.id}`;
          // Always use fresh name from API, update stored names
          const freshName = c.summary || '';
          displayNames[url] = freshName; // Update stored name
          
          // Priority: user override > Google's calendar color > stored color > default
          const fetchedColor = c.backgroundColor;
          const isColorOverwritten = configDoc.colorOverwritten?.[url] || false;
          let calendarColor = '#4285f4'; // Default Google blue
          
          if (isColorOverwritten && colors[url]) {
            // Use user's custom color if they've overridden it
            calendarColor = colors[url];
          } else if (fetchedColor) {
            // Use Google's actual calendar color, ensure it's bright enough
            const brightColor = ensureBrightColor(fetchedColor);
            calendarColor = brightColor;
            // Store the processed Google color for future reference (but don't mark as overwritten)
            if (!colors[url]) {
              colors[url] = brightColor;
            }
          } else if (colors[url]) {
            // Fall back to previously stored color
            calendarColor = colors[url];
          }
          
          infos.push({
            displayName: freshName,
            url,
            busy: busySet.has(url),
            color: calendarColor
          });
        });
      }
    } catch (e) {
      console.error('[iCloud] Google calendarList error:', e);
    }
    
    // Dedupe by URL
    const map = new Map<string, any>();
    infos.forEach(item => map.set(item.url, item));
    const calendars = Array.from(map.values());
    
    // Save updated display names and colors to database
    configDoc.calendarDisplayNames = displayNames;
    configDoc.calendarColors = { ...configDoc.calendarColors, ...colors };
    if (!configDoc.colorOverwritten) {
      configDoc.colorOverwritten = {};
    }
    await configDoc.save();
    
    return res.json({
      calendars,
      whitelist: configDoc.whitelistUIDs || [],
      busyEvents: configDoc.busyEventUIDs || [],
      colors: configDoc.calendarColors || {},
      colorOverwritten: configDoc.colorOverwritten || {}
    });
  } catch (error) {
    console.error('[iCloud] GET /config error:', error);
    return res.status(500).json({ error: 'Failed to load calendar configuration' });
  }
});

// POST /api/icloud/config - Update calendar configuration
router.post("/config", requireAdmin, async (req, res) => {
  try {
    const { busy = [], colors = {}, colorOverwritten = {} } = req.body;
    await connectMongo();
    
    // Load or create config doc
    const config = await CalendarConfigModel.findOne() || new CalendarConfigModel();
    
    // Update stored settings
    config.busyCalendars = busy;
    
    // Handle color overrides - update colors and override flags
    if (!config.calendarColors) config.calendarColors = {};
    if (!config.colorOverwritten) config.colorOverwritten = {};
    
    // Update colorOverwritten flags for all calendars mentioned in the request
    Object.keys(colorOverwritten).forEach(calendarUrl => {
      config.colorOverwritten[calendarUrl] = colorOverwritten[calendarUrl];
      
      // If user is overriding the color, store their custom color
      if (colorOverwritten[calendarUrl] && colors[calendarUrl]) {
        config.calendarColors[calendarUrl] = colors[calendarUrl];
      }
      // If they're removing the override, we'll let the system use the fetched color again
      // (the stored fetched color will remain in calendarColors but colorOverwritten will be false)
    });
    
    // Fetch and cache display names for any new calendars
    const creds = getIcloudCreds();
    if (creds.username && creds.password && busy.length) {
      const names = await fetchCalendarDisplayNames(busy, creds);
      config.calendarDisplayNames = { ...config.calendarDisplayNames, ...names };
    }
    
    config.updatedAt = new Date();
    await config.save();
    
    console.log('[iCloud] POST /config: Configuration updated, invalidating caches...');
    
    // CACHE INVALIDATION: Clear all calendar caches since busy configuration changed
    // Clear local iCloud eventCache (used by iCloud routes)
    Object.keys(eventCache).forEach(key => delete eventCache[key]);
    console.log(`[iCloud] POST /config: Cleared ${Object.keys(eventCache).length} iCloud cache entries`);
    
    // Clear centralized cache used by Google route - clear all Google-related cache keys
    const cache = getCache();
    if (cache.connected) {
      // We need to clear all Google cache entries, but since we don't have pattern deletion,
      // we'll clear the main ones that are likely to be cached
      const userId = (req as any).user.id;
      await cache.del(`google:all:${userId}`);
      // Clear potential week cache entries (this is limited but better than nothing)
      const today = new Date();
      for (let i = -7; i <= 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i * 7); // Check weeks around current date
        const startStr = date.toISOString().split('T')[0];
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 6);
        const endStr = endDate.toISOString().split('T')[0];
        await cache.del(`google:week:${startStr}:${endStr}:${userId}`);
      }
      console.log('[iCloud] POST /config: Invalidated Google calendar caches');
    } else {
      console.log('[iCloud] POST /config: Cache not connected, skipping Google cache invalidation');
    }
    
    console.log('[iCloud] POST /config: Configuration updated, fetching all calendars...');
    
    // After updating configuration, fetch all calendars (both iCloud and Google) 
    // by reusing the same logic as GET /config to ensure consistency
    const infos: any[] = [];
    const busySet = new Set(busy);
    const displayNames = config.calendarDisplayNames || {};
    
    // Google calendars (same logic as GET /config)
    try {
      const gClient = await getAuthorizedClient((req as any).user.id);
      if (gClient) {
        const gapi = google.calendar({ version: 'v3', auth: gClient });
        const list = await gapi.calendarList.list({ maxResults: 250 });
        (list.data.items || []).forEach((c: any) => {
          const url = `google://${c.id}`;
          // Always use fresh name from API, update stored names
          const freshName = c.summary || '';
          displayNames[url] = freshName; // Update stored name
          
          // Priority: user override > Google's calendar color > stored color > default
          const fetchedColor = c.backgroundColor;
          const isColorOverwritten = config.colorOverwritten?.[url] || false;
          let calendarColor = '#4285f4'; // Default Google blue
          
          if (isColorOverwritten && config.calendarColors?.[url]) {
            // Use user's custom color if they've overridden it
            calendarColor = config.calendarColors[url];
          } else if (fetchedColor) {
            // Use Google's actual calendar color, ensure it's bright enough
            const brightColor = ensureBrightColor(fetchedColor);
            calendarColor = brightColor;
            if (!config.calendarColors) config.calendarColors = {};
            if (!config.calendarColors[url]) {
              config.calendarColors[url] = brightColor;
            }
          } else if (config.calendarColors?.[url]) {
            // Fall back to previously stored color
            calendarColor = config.calendarColors[url];
          }
          
          infos.push({
            displayName: freshName,
            url,
            busy: busySet.has(url),
            color: calendarColor
          });
        });
      }
    } catch (e) {
      console.error('[iCloud] POST /config Google calendarList error:', e);
    }
    
    // iCloud calendars - using DAVClient approach (reuse from GET /config logic)
    try {
      const creds = getIcloudCreds();
      if (creds.username && creds.password) {
        console.log('[iCloud] POST /config: Starting iCloud calendar discovery...');
        
        try {
          const client = new DAVClient({
            serverUrl: "https://caldav.icloud.com",
            credentials: creds,
            authMethod: "Basic",
            defaultAccountType: "caldav",
          });

          await client.login();
          const calendars = await client.fetchCalendars();
          console.log(`[iCloud] POST /config: DAVClient found ${calendars.length} calendars`);
          
          // Fetch colors for each iCloud calendar using improved method
          const calendarColors: Record<string, string> = {};
          for (const cal of calendars) {
            try {
              // Try multiple approaches to get calendar color
              let foundColor = false;
              
              // Method 1: Try using tsdav PROPFIND with Apple namespace
              try {
                const colorResult = await client.propfind({
                  url: cal.url,
                  props: [{ name: "calendar-color", namespace: DAVNamespace.CALDAV_APPLE }],
                  depth: "0"
                });
                
                if (colorResult && colorResult.length > 0) {
                  const firstResult = colorResult[0];
                  let colorProp = null;
                  
                  console.log(`[iCloud] POST /config: Full PROPFIND response for ${cal.displayName}:`, JSON.stringify(firstResult, null, 2));
                  
                  // Handle different possible response structures for calendar-color
                  if (firstResult.props) {
                    // Try different property key formats that CalDAV servers use
                    const possibleKeys = [
                      '{http://apple.com/ns/ical/}calendar-color',
                      'calendar-color',
                      'apple:calendar-color',
                      'ical:calendar-color'
                    ];
                    
                    for (const key of possibleKeys) {
                      if (firstResult.props[key]) {
                        colorProp = firstResult.props[key];
                        console.log(`[iCloud] POST /config: Found color property with key: ${key}`, colorProp);
                        break;
                      }
                    }
                    
                    // If still not found, try searching through all properties
                    if (!colorProp) {
                      const allKeys = Object.keys(firstResult.props);
                      console.log(`[iCloud] POST /config: Available property keys for ${cal.displayName}:`, allKeys);
                      
                      const colorKey = allKeys.find(key => 
                        key.toLowerCase().includes('calendar-color') ||
                        key.toLowerCase().includes('color')
                      );
                      
                      if (colorKey) {
                        colorProp = firstResult.props[colorKey];
                        console.log(`[iCloud] POST /config: Found color via search: ${colorKey}`, colorProp);
                      }
                    }
                  }
                  
                  // Extract color value from different possible structures
                  let colorValue = null;
                  if (colorProp?.value && typeof colorProp.value === 'string') {
                    colorValue = colorProp.value;
                  } else if (typeof colorProp === 'string') {
                    colorValue = colorProp;
                  } else if (colorProp?._ && typeof colorProp._ === 'string') {
                    colorValue = colorProp._; // Some XML parsers use underscore for text content
                  }
                  
                  if (colorValue) {
                    const normalizedColor = normalizeHexColor(colorValue.trim());
                    calendarColors[cal.url] = normalizedColor;
                    console.log(`[iCloud] POST /config: ✅ Found color via PROPFIND: ${colorValue.trim()} -> normalized to ${normalizedColor} for calendar ${cal.displayName}`);
                    foundColor = true;
                  }
                }
              } catch (propfindError) {
                console.warn(`[iCloud] POST /config: PROPFIND failed for calendar ${cal.displayName}:`, propfindError);
              }
              
              // Method 2: Try direct PROPFIND with raw fetch if tsdav fails
              if (!foundColor) {
                try {
                  const creds = getIcloudCreds();
                  const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:apple="http://apple.com/ns/ical/">
  <d:prop>
    <apple:calendar-color/>
  </d:prop>
</d:propfind>`;

                  const response = await fetch(cal.url, {
                    method: 'PROPFIND',
                    headers: {
                      'Authorization': `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`,
                      'Content-Type': 'application/xml',
                      'Depth': '0',
                    },
                    body: propfindBody,
                  });

                  if (response.ok) {
                    const xmlText = await response.text();
                    console.log(`[iCloud] POST /config: Raw PROPFIND XML response for ${cal.displayName}:`, xmlText);
                    
                    // Try multiple XML patterns for calendar-color
                    const colorPatterns = [
                      /<apple:calendar-color[^>]*>([^<]+)<\/apple:calendar-color>/i,
                      /<calendar-color[^>]*>([^<]+)<\/calendar-color>/i,
                      /<[^:]*:calendar-color[^>]*>([^<]+)<\/[^:]*:calendar-color>/i,
                      /calendar-color[^>]*>([^<]+)</i
                    ];
                    
                    for (const pattern of colorPatterns) {
                      const colorMatch = xmlText.match(pattern);
                      if (colorMatch && colorMatch[1]) {
                        const rawColor = colorMatch[1].trim();
                        const normalizedColor = normalizeHexColor(rawColor);
                        calendarColors[cal.url] = normalizedColor;
                        console.log(`[iCloud] POST /config: ✅ Found color via raw PROPFIND (pattern ${pattern}): ${rawColor} -> normalized to ${normalizedColor} for calendar ${cal.displayName}`);
                        foundColor = true;
                        break;
                      }
                    }
                  }
                } catch (rawError) {
                  console.warn(`[iCloud] POST /config: Raw PROPFIND failed for calendar ${cal.displayName}:`, rawError);
                }
              }
              
              // Method 3: iCloud calendars may not have explicit color properties
              // Leave foundColor as false - we'll use default/stored colors in the priority logic
              if (!foundColor) {
                console.log(`[iCloud] POST /config: No color property found for calendar ${cal.displayName}, will use default or stored color`);
              }
              
            } catch (colorError) {
              console.warn(`[iCloud] POST /config: All color methods failed for calendar ${cal.displayName}:`, colorError);
              // Final fallback - use a default color
              calendarColors[cal.url] = '#007AFF';
            }
          }
          
          calendars.forEach((cal: any, index: number) => {
            const url = cal.url;
            // Always use fresh name from API, update stored names
            const freshName = cal.displayName || url.split('/').filter(Boolean).pop() || url;
            displayNames[url] = freshName; // Update stored name
            
            // Priority: user override > fetched calendar color > stored color > sensible default
            const fetchedColor = calendarColors[url];
            const isColorOverwritten = config.colorOverwritten?.[url] || false;
            
            // Define a better set of default colors for iCloud calendars
            const defaultIcloudColors = [
              '#007AFF', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', 
              '#00C7BE', '#32ADE6', '#5856D6', '#AF52DE', '#FF2D92'
            ];
            const defaultColor = defaultIcloudColors[index % defaultIcloudColors.length];
            
            let calendarColor = defaultColor; // Sensible default from iOS color palette
            
            if (isColorOverwritten && config.calendarColors?.[url]) {
              // Use user's custom color if they've overridden it
              calendarColor = config.calendarColors[url];
            } else if (fetchedColor) {
              // Use the actual calendar color from iCloud CalDAV
              calendarColor = fetchedColor;
              if (!config.calendarColors) config.calendarColors = {};
              config.calendarColors[url] = fetchedColor;
            } else if (config.calendarColors?.[url]) {
              // Fall back to previously stored color
              calendarColor = config.calendarColors[url];
            } else {
              // Store the default color for future reference
              if (!config.calendarColors) config.calendarColors = {};
              config.calendarColors[url] = defaultColor;
            }
            
            infos.push({
              displayName: freshName,
              url,
              busy: busySet.has(url),
              color: calendarColor
            });
          });
          
        } catch (davError) {
          console.error('[iCloud] POST /config: DAVClient failed:', davError);
          
          // Fallback to stored calendars when DAVClient fails
          if (config.busyCalendars?.length) {
            config.busyCalendars.forEach((url: string) => {
              if (url.startsWith('https://caldav.icloud.com/')) {
                const name = displayNames[url] || url.split('/').filter(Boolean).pop() || url;
                if (!infos.find(cal => cal.url === url)) {
                  infos.push({
                    displayName: name,
                    url,
                    busy: busySet.has(url),
                    color: colors[url] || '#007AFF'
                  });
                }
              }
            });
          }
        }
      }
    } catch (e) {
      console.error('[iCloud] POST /config: iCloud calendars error:', e);
    }
    
    // Dedupe by URL (same as GET /config)
    const map = new Map<string, any>();
    infos.forEach(item => map.set(item.url, item));
    const calendars = Array.from(map.values());
    
    // Save updated display names to database
    config.calendarDisplayNames = displayNames;
    await config.save();
    
    console.log(`[iCloud] POST /config: Returning ${calendars.length} calendars (${calendars.filter(c => c.busy).length} busy)`);

    res.json({
      calendars,
      whitelist: config.whitelistUIDs || [],
      busyEvents: config.busyEventUIDs || [],
      colors: config.calendarColors || {},
      colorOverwritten: config.colorOverwritten || {}
    });
  } catch (error) {
    console.error('[iCloud] POST /config error:', error);
    return res.status(500).json({ error: 'Failed to update calendar configuration' });
  }
});

// GET /api/icloud/status - Check iCloud connection status
// Debug endpoint to test direct CalDAV discovery
router.get("/debug-discovery", requireAdmin, async (req, res) => {
  try {
    const creds = getIcloudCreds();
    if (!creds.username || !creds.password) {
      return res.status(400).json({ error: "Missing iCloud credentials" });
    }
    
    console.log('[DEBUG] Testing direct CalDAV discovery...');
    const calendars = await discoverIcloudCalendars(creds);
    
    res.json({
      success: true,
      calendarsFound: calendars.length,
      calendars: calendars.map(cal => ({
        url: cal.url,
        displayName: cal.displayName
      }))
    });
  } catch (error) {
    console.error('[DEBUG] Discovery failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get("/status", requireAdmin, async (req, res) => {
  try {
    const creds = getIcloudCreds();
    
    if (!creds.username || !creds.password) {
      return res.json({
        connected: false,
        error: "Missing credentials",
        hasUsername: !!creds.username,
        hasPassword: !!creds.password
      });
    }

    // Use the new DAVClient API (v1.1.0+) properly  
    const client = new DAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: creds,
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });

    console.log('[iCloud] DAVClient created, attempting login...');
    
    // Login first (required for new API)
    await client.login();
    console.log('[iCloud] Login successful!');

    // Now fetch calendars using the new API
    const calendars = await client.fetchCalendars();
    console.log(`[iCloud] fetchCalendars result: ${calendars.length} calendars found`);
    
    if (calendars.length > 0) {
      console.log('[iCloud] Calendar details:', calendars.map((c: any) => ({ 
        displayName: c.displayName, 
        url: c.url 
      })));
    }

    res.json({
      connected: true,
      calendarsFound: calendars.length,
      calendars: calendars.map((cal: any) => ({ name: cal.displayName, url: cal.url }))
    });

  } catch (error) {
    console.error('[iCloud] Status check error:', error);
    res.json({
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get("/week", requireAdmin, async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: "start_and_end_required" });
  }

  const from = new Date(start as string + "T00:00:00.000Z"); // Start of start day
  const to = new Date(end as string + "T23:59:59.999Z");     // End of end day
  
  const events = await fetchAndCacheEvents(from, to, "no-cache");
  res.json({ events, cached: false });
});

router.get("/day", requireAdmin, async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: "date_required" });
  }

  const from = new Date(date as string);
  const to = new Date(from.getTime() + 86400000);
  const cacheKey = createCacheKey("icloud", "day", date as string);
  
  const cached = getCachedEvents(cacheKey);
  if (cached) {
    res.json({ events: cached, cached: true });
    fetchAndCacheEvents(from, to, cacheKey).catch(() => {});
    return;
  }

  const events = await fetchAndCacheEvents(from, to, cacheKey);
  res.json({ events, cached: false });
});

router.get("/month", requireAdmin, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: "year_and_month_required" });
  }

  const from = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  const to = new Date(Date.UTC(Number(year), Number(month), 1));
  const cacheKey = createCacheKey("icloud", "month", year as string, month as string);
  
  const cached = getCachedEvents(cacheKey);
  if (cached) {
    res.json({ events: cached, cached: true });
    fetchAndCacheEvents(from, to, cacheKey).catch(() => {});
    return;
  }

  const events = await fetchAndCacheEvents(from, to, cacheKey);
  res.json({ events, cached: false });
});

router.get("/all", requireAdmin, async (req, res) => {
  // Fetch ALL events - use very wide date range to avoid filtering
  const from = new Date('1900-01-01'); // Start from way in the past
  const to = new Date('2100-12-31');   // Go way into the future
  const cacheKey = createCacheKey("icloud", "all", "all-events");
  
  const cached = getCachedEvents(cacheKey);
  if (cached) {
    res.json({ events: cached, cached: true });
    fetchAndCacheEvents(from, to, cacheKey).catch(() => {});
    return;
  }

  const events = await fetchAndCacheEvents(from, to, cacheKey);
  res.json({ events, cached: false });
});

router.post("/delete-event", requireAdmin, async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "Event UID is required" });
    }

    console.log(`[DELETE] Starting deletion for UID: ${uid}`);

    // First, try to find the event in our cache to get calendar info
    let targetCalendarUrl = null;
    let eventFound = false;

    // Search through cached events to find which calendar contains this event
    const cacheKeys = Object.keys(eventCache);
    for (const key of cacheKeys) {
      if (key.includes('icloud') && eventCache[key] && Array.isArray(eventCache[key])) {
        const events = eventCache[key];
        for (const event of events) {
          if (event.uid === uid) {
            targetCalendarUrl = event.calendarUrl;
            eventFound = true;
            console.log(`[DELETE] Found event in cached data, calendar: ${event.calendar || 'unknown'}`);
            break;
          }
        }
        if (eventFound) break;
      }
    }

    const { username, password } = getIcloudCreds();
    const client = new DAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: {
        username,
        password,
      },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });

    // Login to iCloud
    await client.login();

    let eventDeleted = false;

    if (targetCalendarUrl) {
      try {
        // We know which calendar, so fetch only that calendar's objects
        const calendars = await client.fetchCalendars();
        const targetCalendar = calendars.find(cal => cal.url === targetCalendarUrl);
        
        if (targetCalendar) {
          console.log(`[DELETE] Searching specific calendar: ${targetCalendar.displayName}`);
          const calendarObjects = await client.fetchCalendarObjects({
            calendar: targetCalendar,
            expand: false,
          });

          const eventObject = calendarObjects.find(obj => 
            obj.data && obj.data.includes(`UID:${uid}`)
          );

          if (eventObject) {
            await client.deleteCalendarObject({
              calendarObject: eventObject,
            });
            console.log(`[DELETE] Successfully deleted event from ${targetCalendar.displayName}`);
            eventDeleted = true;
          }
        }
      } catch (calError) {
        console.log(`[DELETE] Error with targeted deletion:`, calError);
        // Fall back to broad search
      }
    }

    // Fallback: search all calendars if targeted approach failed
    if (!eventDeleted) {
      console.log(`[DELETE] Falling back to broad search`);
      const calendars = await client.fetchCalendars();
      
      for (const calendar of calendars) {
        try {
          const calendarObjects = await client.fetchCalendarObjects({
            calendar,
            expand: false,
          });

          const eventObject = calendarObjects.find(obj => 
            obj.data && obj.data.includes(`UID:${uid}`)
          );

          if (eventObject) {
            await client.deleteCalendarObject({
              calendarObject: eventObject,
            });
            console.log(`[DELETE] Successfully deleted event from ${calendar.displayName}`);
            eventDeleted = true;
            break;
          }
        } catch (calError) {
          console.log(`[DELETE] Error searching ${calendar.displayName}:`, calError);
        }
      }
    }

    if (!eventDeleted) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Comprehensive cache invalidation for immediate UI updates
    const { clearAllCalendarCaches } = await import("../cache");
    await clearAllCalendarCaches("delete");

    res.json({ success: true, message: "Event deleted successfully" });
  } catch (error) {
    console.error("[DELETE] Error deleting event:", error);
    res.status(500).json({ 
      error: "Failed to delete event", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});


export { router, getIcloudCreds };
