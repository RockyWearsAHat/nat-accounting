/**
 * Client-side RRULE expansion utility for calendar events
 * Efficiently expands recurring events within date ranges for instant navigation
 */

import { rrulestr, RRule } from 'rrule';
import { CalendarEvent } from '../types/calendar';

/**
 * Expands recurring events within the specified date range
 * @param rawEvents - Raw events from backend (some with RRULE data)
 * @param rangeStart - Start of date range to expand events for
 * @param rangeEnd - End of date range to expand events for
 * @returns Array of expanded events within the date range
 */
export function expandEventsInRange(
  rawEvents: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date
): CalendarEvent[] {
  const expandedEvents: CalendarEvent[] = [];
  
  console.log(`[RRULE Expander] Expanding ${rawEvents.length} raw events for range ${rangeStart.toISOString().split('T')[0]} to ${rangeEnd.toISOString().split('T')[0]}`);
  
  for (const event of rawEvents) {
    try {
      if (event.isRecurring && (event.rrule || event.recurrence)) {
        // Expand recurring event
        const occurrences = expandRecurringEvent(event, rangeStart, rangeEnd);
        expandedEvents.push(...occurrences);
        if (occurrences.length > 0) {
          console.log(`[RRULE Expander] Expanded "${event.summary}" to ${occurrences.length} occurrences:`, 
            occurrences.map(o => `${o.start} -> ${new Date(o.start).toLocaleString()}`));
        }
      } else {
        // Non-recurring event - check if it falls within range
        const eventStart = new Date(event.start);
        const eventEnd = event.end ? new Date(event.end) : eventStart;
        
        // Include event if it overlaps with range
        if (eventStart <= rangeEnd && eventEnd >= rangeStart) {
          console.log(`[RRULE Expander] Including non-recurring "${event.summary}" at ${event.start} -> ${eventStart.toLocaleString()} (timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
          console.log(`[RRULE Expander] Original UTC: ${eventStart.toISOString()}, Local hours: ${eventStart.getHours()}, UTC hours: ${eventStart.getUTCHours()}`);
          expandedEvents.push(event);
        }
      }
    } catch (error) {
      console.error(`[RRULE Expander] Error processing event "${event.summary}":`, error);
      // Include the original event as fallback
      const eventStart = new Date(event.start);
      const eventEnd = event.end ? new Date(event.end) : eventStart;
      if (eventStart <= rangeEnd && eventEnd >= rangeStart) {
        expandedEvents.push(event);
      }
    }
  }
  
  console.log(`[RRULE Expander] Expanded to ${expandedEvents.length} total events in range`);
  return expandedEvents;
}

/**
 * Expands a single recurring event using RRULE or Google recurrence data
 */
function expandRecurringEvent(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date
): CalendarEvent[] {
  const occurrences: CalendarEvent[] = [];
  
  try {
    let rrule: RRule;
    
    console.log(`[RRULE Expander] Processing recurring event "${event.summary}":`, {
      originalStart: event.start,
      originalEnd: event.end,
      hasRrule: !!event.rrule,
      hasRecurrence: !!event.recurrence,
      rruleValue: event.rrule,
      recurrenceValue: event.recurrence
    });
    
    // Special debugging for Acctg 5140
    const isAcctg5140 = event.summary?.includes('Acctg 5140') && !event.summary?.includes('exam');
    if (isAcctg5140) {
      console.log(`[RRULE Expander] 🎯 ACCTG 5140 EVENT DETECTED:`, {
        summary: event.summary,
        start: event.start,
        rrule: event.rrule,
        hasRaw: !!event.raw,
        rawLength: event.raw?.length || 0
      });
    }
    
    if (event.rrule) {
      // iCloud RRULE format - validate and parse
      const dtstart = new Date(event.start);
      console.log(`[RRULE Expander] Using iCloud RRULE with dtstart:`, dtstart.toISOString(), 'local:', dtstart.toLocaleString());
      
      // Check for invalid RRULE dates (common issue with deleted recurring events)
      if (event.rrule.includes('UNTIL=')) {
        const untilMatch = event.rrule.match(/UNTIL=(\d{8}T\d{6}Z)/);
        if (untilMatch) {
          const untilDateStr = untilMatch[1];
          const untilYear = parseInt(untilDateStr.substring(0, 4));
          const currentYear = new Date().getFullYear();
          
          // If UNTIL date is way in the past (like 1919) or future (like 2099), 
          // this is likely a corrupted/deleted recurring event
          if (untilYear < currentYear - 10 || untilYear > currentYear + 100) {
            console.warn(`[RRULE Expander] Invalid UNTIL date ${untilYear} in RRULE for "${event.summary}", treating as one-off event`);
            // Treat as one-off event instead of recurring
            const eventStart = new Date(event.start);
            const eventEnd = event.end ? new Date(event.end) : eventStart;
            if (eventStart <= rangeEnd && eventEnd >= rangeStart) {
              return [{...event, isRecurring: false, rrule: undefined}];
            } else {
              return [];
            }
          }
        }
      }
      
      // Make sure we pass UTC date to rrule to maintain consistency
      rrule = rrulestr(event.rrule, { dtstart });
    } else if (event.recurrence) {
      // Google Calendar recurrence format - convert to RRULE
      console.log(`[RRULE Expander] Converting Google recurrence:`, event.recurrence);
      rrule = convertGoogleRecurrenceToRRule(event.recurrence, event.start);
    } else {
      console.warn(`[RRULE Expander] Event "${event.summary}" marked as recurring but has no rrule/recurrence data`);
      return [event];
    }
    
    // Generate occurrences within the date range
    const eventStart = new Date(event.start);
    const eventEnd = event.end ? new Date(event.end) : eventStart;
    const duration = eventEnd.getTime() - eventStart.getTime();
    
    console.log(`[RRULE Expander] Event duration: ${duration}ms (${duration / 60000} minutes)`);
    
    // Use rrule.between() for efficient range-based expansion
    const occurrenceDates = rrule.between(rangeStart, rangeEnd, true);
    console.log(`[RRULE Expander] Generated ${occurrenceDates.length} occurrence dates:`, 
      occurrenceDates.map(d => d.toISOString()));
    
    // Check for EXDATE (exception dates) in the raw event data
    let exceptionDates: Date[] = [];
    if (event.raw && typeof event.raw === 'string') {
      if (isAcctg5140) {
        console.log(`[RRULE Expander] 🎯 ACCTG 5140 Raw data contains:`, {
          hasExdate: event.raw.includes('EXDATE'),
          rawSnippet: event.raw.substring(0, 500) + '...'
        });
      }
      
      // Updated regex to capture TZID parameter and date value separately
      const exdateMatches = event.raw.match(/EXDATE(?:;TZID=([^:]+))?:([^\r\n]+)/g);
      if (exdateMatches) {
        console.log(`[RRULE Expander] Found EXDATE entries for "${event.summary}":`, exdateMatches);
        if (isAcctg5140) {
          console.log(`[RRULE Expander] 🎯 ACCTG 5140 EXDATE entries:`, exdateMatches);
        }
        exceptionDates = exdateMatches.flatMap((match: string) => {
          // Parse EXDATE line: could be "EXDATE:20250929T140000" or "EXDATE;TZID=America/Denver:20250929T140000"
          const tzidMatch = match.match(/EXDATE(?:;TZID=([^:]+))?:(.+)/);
          if (!tzidMatch) {
            console.warn(`[RRULE Expander] Failed to parse EXDATE line: "${match}"`);
            return [];
          }
          
          const timezone = tzidMatch[1]; // e.g., "America/Denver" or undefined
          const dateStr = tzidMatch[2]; // e.g., "20250929T140000"
          
          console.log(`[RRULE Expander] Parsing EXDATE with timezone="${timezone}", dateStr="${dateStr}"`);
          
          // Handle multiple dates separated by commas
          return dateStr.split(',').map((d: string) => {
            try {
              // Parse EXDATE format (YYYYMMDDTHHMMSSZ or YYYYMMDD)
              if (d.includes('T')) {
                const year = parseInt(d.substring(0, 4));
                const month = parseInt(d.substring(4, 6)) - 1; // JS months are 0-based
                const day = parseInt(d.substring(6, 8));
                const hour = parseInt(d.substring(9, 11)) || 0;
                const minute = parseInt(d.substring(11, 13)) || 0;
                const second = parseInt(d.substring(13, 15)) || 0;
                
                let exceptionDate: Date;
                
                if (d.endsWith('Z')) {
                  // UTC date
                  exceptionDate = new Date(Date.UTC(year, month, day, hour, minute, second));
                } else if (timezone) {
                  // Timezone-aware date - convert to UTC
                  if (timezone === 'America/Denver') {
                    // For Mountain Time to UTC conversion:
                    // The EXDATE is in local Mountain Time, need to convert to UTC
                    // September is during MDT (Mountain Daylight Time = UTC-6)
                    // So 2:00 PM MDT = 8:00 PM UTC (20:00)
                    
                    // Create a date object as if it were in UTC, then adjust for MT offset
                    const utcDate = new Date(Date.UTC(year, month, day, hour, minute, second));
                    // Add 6 hours to convert from MDT to UTC
                    exceptionDate = new Date(utcDate.getTime() + (6 * 60 * 60 * 1000));
                    
                    console.log(`[RRULE Expander] MT EXDATE ${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} -> UTC ${exceptionDate.toISOString()}`);
                  } else {
                    // For other timezones, treat as local time (fallback)
                    exceptionDate = new Date(year, month, day, hour, minute, second);
                    console.warn(`[RRULE Expander] Unknown timezone "${timezone}", treating as local time`);
                  }
                } else {
                  // No timezone specified, treat as local time
                  exceptionDate = new Date(year, month, day, hour, minute, second);
                }
                
                console.log(`[RRULE Expander] Parsed EXDATE: ${d} -> ${exceptionDate.toISOString()}`);
                return exceptionDate;
              } else {
                // All-day exception
                const year = parseInt(d.substring(0, 4));
                const month = parseInt(d.substring(4, 6)) - 1;
                const day = parseInt(d.substring(6, 8));
                return new Date(year, month, day);
              }
            } catch (error) {
              console.warn(`[RRULE Expander] Failed to parse EXDATE "${d}":`, error);
              return null;
            }
          }).filter(Boolean) as Date[];
        });
        console.log(`[RRULE Expander] Parsed ${exceptionDates.length} exception dates:`, 
          exceptionDates.map(d => d.toISOString()));
      }
    }
    
    for (const occurrenceStart of occurrenceDates) {
      // Check if this occurrence is an exception (EXDATE)
      const isException = exceptionDates.some(exDate => {
        // Compare dates within 1 minute tolerance to handle timezone issues
        const timeDiff = Math.abs(occurrenceStart.getTime() - exDate.getTime());
        const isMatch = timeDiff < 60000;
        
        if (isAcctg5140) {
          console.log(`[RRULE Expander] 🎯 ACCTG 5140 Exception check:`, {
            occurrence: occurrenceStart.toISOString(),
            exceptionDate: exDate.toISOString(),
            timeDiff: timeDiff,
            isMatch: isMatch
          });
        }
        
        return isMatch;
      });
      
      if (isException) {
        console.log(`[RRULE Expander] Skipping exception date: ${occurrenceStart.toISOString()}`);
        if (isAcctg5140) {
          console.log(`[RRULE Expander] 🎯 ACCTG 5140 SKIPPED DUE TO EXDATE`);
        }
        continue;
      }
      const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
      
      const occurrence: CalendarEvent = {
        ...event,
        start: occurrenceStart.toISOString(), // Always UTC format
        end: occurrenceEnd.toISOString(),     // Always UTC format
        uid: event.uid ? `${event.uid}_${occurrenceStart.getTime()}` : undefined,
        // Mark as expanded occurrence (not original recurring event)
        isRecurring: false,
        rrule: undefined,
        recurrence: undefined
      };
      
      console.log(`[RRULE Expander] Created occurrence: ${occurrence.start} -> local time: ${new Date(occurrence.start).toLocaleString()}`);
      
      occurrences.push(occurrence);
    }
    
  } catch (error) {
    console.error(`[RRULE Expander] Error expanding recurring event "${event.summary}":`, error);
    // Return original event as fallback
    return [event];
  }
  
  return occurrences;
}

/**
 * Converts Google Calendar recurrence object to RRule
 * Google format: ["RRULE:FREQ=WEEKLY;BYDAY=TU,TH"]
 */
function convertGoogleRecurrenceToRRule(recurrence: any, startDate: string): RRule {
  if (!Array.isArray(recurrence) || recurrence.length === 0) {
    throw new Error('Invalid Google recurrence format');
  }
  
  // Find the RRULE string in the recurrence array
  const rruleString = recurrence.find((rule: string) => 
    typeof rule === 'string' && rule.startsWith('RRULE:')
  );
  
  if (!rruleString) {
    throw new Error('No RRULE found in Google recurrence');
  }
  
  // Parse with start date
  const dtstart = new Date(startDate);
  return rrulestr(rruleString, { dtstart });
}

/**
 * Pre-filter events by calendar configuration to avoid expanding unnecessary events
 */
export function filterEventsByCalendarConfig(
  events: CalendarEvent[],
  config: any
): CalendarEvent[] {
  if (!config?.calendars) {
    return events;
  }
  
  const busyCalendarUrls = new Set(
    config.calendars
      .filter((c: any) => c.busy === true)
      .map((c: any) => c.url)
      .filter(Boolean)
  );
  
  if (busyCalendarUrls.size === 0) {
    return events;
  }
  
  const filteredEvents = events.filter((event) => 
    !event.calendarUrl || busyCalendarUrls.has(event.calendarUrl)
  );
  
  console.log(`[RRULE Expander] Pre-filtered ${events.length} events to ${filteredEvents.length} from busy calendars`);
  return filteredEvents;
}

/**
 * Efficient week expansion - expands events for a specific week
 */
export function expandEventsForWeek(
  rawEvents: CalendarEvent[],
  weekStart: Date,
  config?: any
): CalendarEvent[] {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  
  // Pre-filter by calendar config to avoid unnecessary expansions
  const filteredRawEvents = config ? 
    filterEventsByCalendarConfig(rawEvents, config) : 
    rawEvents;
  
  return expandEventsInRange(filteredRawEvents, weekStart, weekEnd);
}

/**
 * Efficient day expansion - expands events for a specific day
 */
export function expandEventsForDay(
  rawEvents: CalendarEvent[],
  date: Date,
  config?: any
): CalendarEvent[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  
  // Pre-filter by calendar config
  const filteredRawEvents = config ? 
    filterEventsByCalendarConfig(rawEvents, config) : 
    rawEvents;
  
  return expandEventsInRange(filteredRawEvents, dayStart, dayEnd);
}