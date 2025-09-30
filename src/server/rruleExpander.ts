/**
 * Server-side RRULE expansion utility for calendar events
 * Replicates client-side logic for backend availability calculations
 */

import pkg from 'rrule';
import type { RRule as RRuleType } from 'rrule';
const { rrulestr, RRule } = pkg;

export interface CalendarEvent {
  uid?: string;
  summary: string;
  start: string;
  end?: string;
  isRecurring: boolean;
  rrule?: string;
  recurrence?: any;
  calendar?: string;
  calendarUrl?: string;
  blocking?: boolean;
  raw?: string;
}

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
  
  console.log(`[Server RRULE Expander] Expanding ${rawEvents.length} raw events for range ${rangeStart.toISOString().split('T')[0]} to ${rangeEnd.toISOString().split('T')[0]}`);
  
  for (const event of rawEvents) {
    try {
      // First, always check if the original event date falls within range
      const eventStart = new Date(event.start);
      const eventEnd = event.end ? new Date(event.end) : eventStart;
      
      if (eventStart <= rangeEnd && eventEnd >= rangeStart) {
        console.log(`[Server RRULE Expander] Including original "${event.summary}" at ${event.start}`);
        expandedEvents.push(event);
      }
      
      // Then, if it's recurring, also expand the RRULE for additional occurrences
      if (event.isRecurring && (event.rrule || event.recurrence)) {
        // Expand recurring event
        const occurrences = expandRecurringEvent(event, rangeStart, rangeEnd);
        // Only add occurrences that don't conflict with the original event
        for (const occurrence of occurrences) {
          if (occurrence.start !== event.start) {
            expandedEvents.push(occurrence);
          }
        }
        if (occurrences.length > 0) {
          console.log(`[Server RRULE Expander] Expanded "${event.summary}" to ${occurrences.length} additional occurrences`);
        }
      }
    } catch (error) {
      console.error(`[Server RRULE Expander] Error processing event "${event.summary}":`, error);
      // Include the original event as fallback
      const eventStart = new Date(event.start);
      const eventEnd = event.end ? new Date(event.end) : eventStart;
      if (eventStart <= rangeEnd && eventEnd >= rangeStart) {
        expandedEvents.push(event);
      }
    }
  }
  
  console.log(`[Server RRULE Expander] Expanded to ${expandedEvents.length} total events in range`);
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
    let rrule: RRuleType;
    
    console.log(`[Server RRULE Expander] Processing recurring event "${event.summary}"`);
    
    if (event.rrule) {
      // iCloud RRULE format - validate and parse
      let dtstart: Date;
      
      // Extract DTSTART from raw iCal data to preserve original timezone context
      if (event.raw && typeof event.raw === 'string') {
        const dtstartMatch = event.raw.match(/DTSTART(?:;TZID=([^:]+))?:(\d{8}T\d{6})/);
        if (dtstartMatch) {
          const [, tzid, dateStr] = dtstartMatch;
          // Parse the date string in the original timezone context
          const year = parseInt(dateStr.substr(0, 4));
          const month = parseInt(dateStr.substr(4, 2)) - 1; // JS months are 0-based
          const day = parseInt(dateStr.substr(6, 2));
          const hour = parseInt(dateStr.substr(9, 2));
          const minute = parseInt(dateStr.substr(11, 2));
          const second = parseInt(dateStr.substr(13, 2));
          
          // Create date in the original timezone - for America/Denver, create as local time
          if (tzid === 'America/Denver') {
            dtstart = new Date(year, month, day, hour, minute, second);
            console.log(`[Server RRULE Expander] Using original Mountain Time DTSTART for "${event.summary}": ${dtstart.toISOString()}`);
          } else {
            // For other timezones or no TZID, fall back to processed start time
            dtstart = new Date(event.start);
          }
        } else {
          // No DTSTART found in raw data, use processed time
          dtstart = new Date(event.start);
        }
      } else {
        // No raw data, use processed start time
        dtstart = new Date(event.start);
      }
      
      // Check for invalid RRULE dates (common issue with deleted recurring events)
      if (event.rrule.includes('UNTIL=')) {
        const untilMatch = event.rrule.match(/UNTIL=(\d{8}T\d{6}Z)/);
        if (untilMatch) {
          const untilDateStr = untilMatch[1];
          const untilYear = parseInt(untilDateStr.substring(0, 4));
          const currentYear = new Date().getFullYear();
          
          // If UNTIL date is way in the past or future, skip as corrupted
          if (untilYear < currentYear - 10 || untilYear > currentYear + 100) {
            console.warn(`[Server RRULE Expander] Invalid UNTIL date ${untilYear} in RRULE for "${event.summary}", treating as one-off event`);
            const eventStart = new Date(event.start);
            const eventEnd = event.end ? new Date(event.end) : eventStart;
            console.log(`[Server RRULE Expander] Checking range for "${event.summary}": event ${eventStart.toISOString()} to ${eventEnd.toISOString()}, range ${rangeStart.toISOString()} to ${rangeEnd.toISOString()}`);
            if (eventStart <= rangeEnd && eventEnd >= rangeStart) {
              console.log(`[Server RRULE Expander] ✅ Including one-off "${event.summary}" in results`);
              return [{...event, isRecurring: false, rrule: undefined}];
            } else {
              console.log(`[Server RRULE Expander] ❌ Excluding one-off "${event.summary}" - outside range`);
              return [];
            }
          }
        }
      }
      
      rrule = rrulestr(event.rrule, { dtstart });
    } else if (event.recurrence) {
      // Google Calendar recurrence format - convert to RRULE
      console.log(`[Server RRULE Expander] Converting Google recurrence:`, event.recurrence);
      rrule = convertGoogleRecurrenceToRRule(event.recurrence, event.start);
    } else {
      console.warn(`[Server RRULE Expander] Event "${event.summary}" marked as recurring but has no rrule/recurrence data`);
      return [event];
    }
    
    // Generate occurrences within the date range
    const eventStart = new Date(event.start);
    const eventEnd = event.end ? new Date(event.end) : eventStart;
    const duration = eventEnd.getTime() - eventStart.getTime();
    
    // Use rrule.between() for efficient range-based expansion
    const occurrenceDates = rrule.between(rangeStart, rangeEnd, true);
    console.log(`[Server RRULE Expander] Generated ${occurrenceDates.length} occurrence dates`);
    
    // Check for EXDATE (exception dates) in the raw event data
    let exceptionDates: Date[] = [];
    if (event.raw && typeof event.raw === 'string') {
      const exdateMatches = event.raw.match(/EXDATE(?:;TZID=([^:]+))?:([^\r\n]+)/g);
      if (exdateMatches) {
        console.log(`[Server RRULE Expander] Found EXDATE entries for "${event.summary}":`, exdateMatches);
        exceptionDates = exdateMatches.flatMap((match: string) => {
          const tzidMatch = match.match(/EXDATE(?:;TZID=([^:]+))?:(.+)/);
          if (!tzidMatch) {
            console.warn(`[Server RRULE Expander] Failed to parse EXDATE line: "${match}"`);
            return [];
          }
          
          const timezone = tzidMatch[1];
          const dateStr = tzidMatch[2];
          
          return dateStr.split(',').map((d: string) => {
            try {
              if (d.includes('T')) {
                const year = parseInt(d.substring(0, 4));
                const month = parseInt(d.substring(4, 6)) - 1;
                const day = parseInt(d.substring(6, 8));
                const hour = parseInt(d.substring(9, 11)) || 0;
                const minute = parseInt(d.substring(11, 13)) || 0;
                const second = parseInt(d.substring(13, 15)) || 0;
                
                let exceptionDate: Date;
                
                if (d.endsWith('Z')) {
                  exceptionDate = new Date(Date.UTC(year, month, day, hour, minute, second));
                } else if (timezone === 'America/Denver') {
                  // Convert Mountain Time to UTC
                  const utcDate = new Date(Date.UTC(year, month, day, hour, minute, second));
                  exceptionDate = new Date(utcDate.getTime() + (6 * 60 * 60 * 1000));
                } else {
                  exceptionDate = new Date(year, month, day, hour, minute, second);
                }
                
                return exceptionDate;
              } else {
                const year = parseInt(d.substring(0, 4));
                const month = parseInt(d.substring(4, 6)) - 1;
                const day = parseInt(d.substring(6, 8));
                return new Date(year, month, day);
              }
            } catch (error) {
              console.warn(`[Server RRULE Expander] Failed to parse EXDATE "${d}":`, error);
              return null;
            }
          }).filter(Boolean) as Date[];
        });
      }
    }
    
    for (const occurrenceStart of occurrenceDates) {
      // Check if this occurrence is an exception (EXDATE)
      const isException = exceptionDates.some(exDate => {
        const timeDiff = Math.abs(occurrenceStart.getTime() - exDate.getTime());
        return timeDiff < 60000; // 1 minute tolerance
      });
      
      if (isException) {
        console.log(`[Server RRULE Expander] Skipping exception date: ${occurrenceStart.toISOString()}`);
        continue;
      }
      
      const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
      
      const occurrence: CalendarEvent = {
        ...event,
        start: occurrenceStart.toISOString(),
        end: occurrenceEnd.toISOString(),
        uid: event.uid ? `${event.uid}_${occurrenceStart.getTime()}` : undefined,
        // Mark as expanded occurrence
        isRecurring: false,
        rrule: undefined,
        recurrence: undefined
      };
      
      occurrences.push(occurrence);
    }
    
  } catch (error) {
    console.error(`[Server RRULE Expander] Error expanding recurring event "${event.summary}":`, error);
    return [event];
  }
  
  return occurrences;
}

/**
 * Converts Google Calendar recurrence object to RRule
 */
function convertGoogleRecurrenceToRRule(recurrence: any, startDate: string): RRuleType {
  if (!Array.isArray(recurrence) || recurrence.length === 0) {
    throw new Error('Invalid Google recurrence format');
  }
  
  const rruleString = recurrence.find((rule: string) => 
    typeof rule === 'string' && rule.startsWith('RRULE:')
  );
  
  if (!rruleString) {
    throw new Error('No RRULE found in Google recurrence');
  }
  
  const dtstart = new Date(startDate);
  return rrulestr(rruleString, { dtstart });
}

/**
 * Pre-filter events by calendar configuration - only include blocking events
 */
export function filterBlockingEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter(event => event.blocking === true);
}

/**
 * Efficient day expansion - expands events for a specific day
 */
export function expandEventsForDay(
  rawEvents: CalendarEvent[],
  date: Date
): CalendarEvent[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  
  return expandEventsInRange(rawEvents, dayStart, dayEnd);
}