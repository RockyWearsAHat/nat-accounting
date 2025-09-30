import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { http } from "../lib/http";
import { CalendarEvent, CalendarConfig } from "../types/calendar";
import { DayEventsModal } from "./DayEventsModal";
import { ScheduleAppointmentModal } from "./ScheduleAppointmentModal";
import { EventModal } from "./EventModal";
import { OverlapModal } from "./OverlapModal";
import { expandEventsForWeek } from "../lib/rruleExpander";
import styles from "./calendar.module.css";

interface WeeklyCalendarProps {
  config: CalendarConfig | null;
  hours?: {
    [day: string]: { raw: string; startMinutes: number; endMinutes: number };
  } | null;
  onConsultationUpdate: () => void; // trigger refetch after modal actions
  onConfigRefresh: () => void; // trigger refetch after config changes
}

export const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({
  config,
  hours,
  onConfigRefresh,
}) => {
  // Helper function to get week start (Sunday)
  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  // Helper function to get week dates
  function getWeekDates(weekStart: Date): Date[] {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      return date;
    });
  }

  // Utility function to lighten/darken colors
  function shadeColor(color: string, percent: number): string {
    const num = parseInt(color?.replace("#", "") || "444444", 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = ((num >> 8) & 0x00ff) + amt;
    const B = (num & 0x0000ff) + amt;
    return `#${(
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)}`;
  }
  // Format hour label (clean iCloud style - 12h format, minimal)
  function formatHour(h: number): string {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
  }

  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  // Remove selectedDayEvents state, use week cache
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [overlapEvents, setOverlapEvents] = useState<CalendarEvent[] | null>(null);
  const [dayModalLoading, setDayModalLoading] = useState(false);
  const [showQuickSchedule, setShowQuickSchedule] = useState(false);
  const [quickScheduleDate, setQuickScheduleDate] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  // Hover state for connected overlapping events
  const [hoveredEventGroup, setHoveredEventGroup] = useState<string | null>(null);
  const [hoverType, setHoverType] = useState<'full-group' | 'overlap-only' | null>(null);
  const [hoveredEventIndex, setHoveredEventIndex] = useState<number | null>(null);
  const [hoveredEventDay, setHoveredEventDay] = useState<string | null>(null); // Track which day is hovered

  // (removed erroneous duplicate imports)

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Load events when week changes or when a calendar-refresh event is fired

  // Fetch all events once and cache them
  useEffect(() => {
    let isCurrent = true;
    
    const fetchAllEvents = async () => {
      const now = Date.now();
      
      // Only fetch if we haven't fetched recently (cache for 5 minutes)
      if (allEvents.length > 0 && now - lastFetch < 5 * 60 * 1000) {
        console.log(`[WeeklyCalendar] Using cached events (${allEvents.length} events)`);
        return;
      }
      
      try {
        setLoading(true);
        console.log(`[WeeklyCalendar] Fetching all events from merged endpoint...`);
        const data = await http.get<any>("/api/merged/all");
        console.log(`[WeeklyCalendar] Received ${data.events?.length || 0} total events`);
        if (data.metadata?.sourceCounts) {
          console.log(`[WeeklyCalendar] Sources:`, data.metadata.sourceCounts);
        }
        
        if (isCurrent) {
          setAllEvents(data.events || []);
          setLastFetch(now);
        }
      } catch (error) {
        console.error("[WeeklyCalendar] Error loading all events:", error);
        if (isCurrent) {
          setAllEvents([]);
        }
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    fetchAllEvents();
    const handler = () => {
      setLastFetch(0); // Force refresh
      fetchAllEvents();
    };
    window.addEventListener('calendar-refresh', handler);
    
    return () => {
      isCurrent = false;
      window.removeEventListener('calendar-refresh', handler);
    };
  }, [config]);

  // Expand cached events for current week with RRULE processing
  useEffect(() => {
    if (allEvents.length === 0) {
      setEvents([]);
      return;
    }

    console.log(`[WeeklyCalendar] Expanding ${allEvents.length} raw events for week ${weekStart.toISOString().split("T")[0]}`);
    
    // Use RRULE expander with calendar config filtering
    const expandedEvents = expandEventsForWeek(allEvents, weekStart, config);
    
    console.log(`[WeeklyCalendar] Showing ${expandedEvents.length} expanded events for current week`);
    setEvents(expandedEvents);
  }, [allEvents, weekStart, config]);

  // Month names for navigation
  const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Load week events
  const loadWeek = async () => {
    if (loading) return; // allow fetch even before config

    setLoading(true);
    console.log(
      `[WeeklyCalendar] Loading week events for ${
        weekStart.toISOString().split("T")[0]
      }`
    );

    try {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const params: any = {
        start: weekStart.toISOString().split("T")[0],
        end: weekEnd.toISOString().split("T")[0],
      };

      const data = await http.get<any>("/api/merged/week", params);
      console.log(`[WeeklyCalendar] Loaded ${data.events?.length || 0} events`);
      setEvents(data.events || []);
    } catch (error) {
      console.error("[WeeklyCalendar] Error loading week events:", error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // Remove loadDay, use week cache for day modal

  // Navigation functions
  const navigateWeek = (direction: "prev" | "next") => {
    const newWeekStart = new Date(weekStart);
    newWeekStart.setDate(weekStart.getDate() + (direction === "next" ? 7 : -7));
    setWeekStart(newWeekStart);
  };

  const goToCurrentWeek = () => {
    setWeekStart(getWeekStart(new Date()));
  };

  const goToSpecificWeek = (year: number, month: number, day: number) => {
    const date = new Date(year, month - 1, day);
    setWeekStart(getWeekStart(date));
  };

    // ----- Fixed time window for consistent display -----
  const startHour = 6;   // Always start at 6 AM for consistency
  const endHour = 20;    // Always end at 8 PM for consistency
  
  console.log(`[WeeklyCalendar] Time window: ${startHour}:00 AM - ${endHour}:00 PM (${startHour * 60} - ${endHour * 60} minutes)`);
  const hourRange = Array.from({ length: endHour - startHour }, (_, i) =>
    i + startHour
  );

  // Process events for display
  const weekDates = getWeekDates(weekStart);
  const nowDate = new Date(nowTick);
  const daySpanMinutes = Math.max(1, (endHour - startHour) * 60);
  const minuteHeightFactor = 1 / daySpanMinutes; // percentage per minute

  const eventsByDay: Record<
    string,
    (CalendarEvent & { __top: number; __height: number; __lane: number; __baseColor?: string; __startMinutes:number; __durationMinutes:number })[]
  > = {};
  const overlapSlices: Record<string, { startMinutes:number; durationMinutes:number; colors:[string,string]; titles:[string,string]; label:string; topRounded:boolean; bottomRounded:boolean; aIndex:number; bIndex:number; groupId:string }[]> = {};
  // --- Date parsing helpers for calendar display ---
  // The backend normalizes timestamps to .000Z format, but they represent local Mountain Time
  function getDateParts(dateISO: string) {
    try {
      // Always use Date object to properly handle timezone conversion
      // This ensures UTC timestamps are converted to local time for display
      const date = new Date(dateISO);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn(`[WeeklyCalendar] Invalid date: ${dateISO}`);
        return { year: '1970', month: '01', day: '01', hour: 0, minute: 0 };
      }
      
      return {
        year: date.getFullYear().toString(),
        month: (date.getMonth() + 1).toString().padStart(2, '0'),
        day: date.getDate().toString().padStart(2, '0'),
        hour: date.getHours(), // This gives local hours
        minute: date.getMinutes(), // This gives local minutes
      };
    } catch {
      return { year: '0000', month: '00', day: '00', hour: 0, minute: 0 };
    }
  }
  function dayKeyFromISO(dateISO: string) {
    const p = getDateParts(dateISO);
    return `${p.year}-${p.month}-${p.day}`;
  }
  weekDates.forEach((d) => {
    // Use simple date key without timezone conversion
    const key = dayKeyFromISO(d.toISOString());
    eventsByDay[key] = [];
  });

  // Pre-filter events by config (after fetch) - backend already filters by busy calendars
  // We only need to handle declined events and forced busy events here
  const forcedBusy = new Set(config?.busyEvents || []);
  const busySet = new Set(
    (config?.calendars || []).filter((c: any) => c.busy).map((c: any) => c.url)
  );
  
  const relevantEvents = events.filter((ev) => {
    // Filter out declined events
    if (ev.responseStatus === 'declined' || ev.status === 'declined') {
      return false;
    }
    
    // Include forced busy events even if they're not from busy calendars
    const isForcedBusy = ev.uid && forcedBusy.has(ev.uid);
    
    // Backend already filtered by busy calendars, so include all non-declined events + forced busy
    return true || isForcedBusy; // Always true since backend handles calendar filtering
  });

  // Debug: log configuration and events
  console.log(`[WeeklyCalendar] Config calendars:`, config?.calendars?.map(c => ({url: c.url, busy: c.busy})));
  console.log(`[WeeklyCalendar] Total events from backend: ${events.length}`);
  
  // DEBUG: Check for specific problem events
  const problemEvents = events.filter(e => 
    e.summary?.toLowerCase().includes('acctg') || 
    e.summary?.toLowerCase().includes('lassonde') ||
    e.summary?.toLowerCase().includes('exam')
  );
  console.log(`[WeeklyCalendar] Problem events (Acctg/Lassonde/Exam):`, problemEvents.map(e => ({
    summary: e.summary,
    start: e.start,
    end: e.end,
    isRecurring: e.isRecurring,
    rrule: e.rrule,
    calendar: e.calendar,
    uid: e.uid
  })));
  
  // DEBUG: Check current week events specifically  
  const currentWeekStart = weekDates[0];
  const currentWeekEnd = new Date(weekDates[weekDates.length - 1]);
  currentWeekEnd.setHours(23, 59, 59, 999);
  
  const currentWeekEvents = events.filter(e => {
    const eventDate = new Date(e.start);
    return eventDate >= currentWeekStart && eventDate <= currentWeekEnd;
  });
  
  console.log(`[WeeklyCalendar] Events in current week (${currentWeekStart.toISOString().split('T')[0]} to ${currentWeekEnd.toISOString().split('T')[0]}):`, 
    currentWeekEvents.map(e => ({
      summary: e.summary,
      start: e.start,
      startLocal: new Date(e.start).toLocaleString(),
      end: e.end,
      calendar: e.calendar,
      isRecurring: e.isRecurring
    })));
    
  console.log(`[WeeklyCalendar] Filtered relevant events: ${relevantEvents.length}`);
  console.log(`[WeeklyCalendar] All event summaries:`, events.map(e => ({
    summary: e.summary,
    start: e.start,
    calendarUrl: e.calendarUrl,
    platform: e.calendarUrl?.includes('icloud.com') ? 'iCloud' : 'Google'
  })));
  
  let debugCount = 0;
  
  // Separate all-day and timed events
  const allDayEventsByDay: Record<string, CalendarEvent[]> = {};
  weekDates.forEach((d) => {
    const key = dayKeyFromISO(d.toISOString());
    allDayEventsByDay[key] = [];
  });

  for (const ev of relevantEvents) {
    const startParts = getDateParts(ev.start);
    const endParts = getDateParts(ev.end || ev.start);
    const dateKey = dayKeyFromISO(ev.start);
    
    // Debug Injection events specifically  
    if (ev.summary?.toLowerCase().includes('injection')) {
      console.log(`[WeeklyCalendar] INJECTION EVENT "${ev.summary}":`, {
        originalStart: ev.start,
        originalEnd: ev.end,
        parsedStartHour: startParts.hour,
        parsedStartMinute: startParts.minute,
        parsedEndHour: endParts.hour,
        parsedEndMinute: endParts.minute,
        startMinutesFromDay: startParts.hour * 60 + startParts.minute,
        endMinutesFromDay: (endParts.hour * 60 + endParts.minute) || ((startParts.hour * 60 + startParts.minute) + 30),
        calendarUrl: ev.calendarUrl,
        dateKey: dateKey,
        platform: ev.calendarUrl?.includes('icloud.com') ? 'iCloud' : 'Google'
      });
    }
    
    // Debug Lassonde shift events specifically
    if (ev.summary?.toLowerCase().includes('lassonde')) {
      console.log(`[WeeklyCalendar] LASSONDE EVENT "${ev.summary}":`, {
        originalStart: ev.start,
        originalEnd: ev.end,
        parsedStartHour: startParts.hour,
        parsedStartMinute: startParts.minute,
        parsedEndHour: endParts.hour,
        parsedEndMinute: endParts.minute,
        calendarUrl: ev.calendarUrl,
        dateKey: dateKey
      });
    }
    
    // Debug first few events to see time parsing
    if (debugCount < 3) {
      console.log(`[WeeklyCalendar] Event "${ev.summary}":`, {
        originalStart: ev.start,
        originalEnd: ev.end,
        parsedHour: startParts.hour,
        parsedMinute: startParts.minute,
        calendarUrl: ev.calendarUrl,
        dateKey: dateKey
      });
      debugCount++;
    }

    // Calculate minutes for all-day detection
    const startMinutesFromDay = startParts.hour * 60 + startParts.minute;
    const endMinutesFromDay = (endParts.hour * 60 + endParts.minute) || (startMinutesFromDay + 30);
    
    // Detect all-day events - improve detection for various formats
    const isAllDay = 
      // Standard all-day: starts at 00:00
      (startParts.hour === 0 && startParts.minute === 0) && 
      (
        // Ends at 23:59 (same day)
        (endParts.hour === 23 && endParts.minute === 59) || 
        // Ends at 00:00 (next day)
        (endParts.hour === 0 && endParts.minute === 0) ||
        // Duration is exactly 24 hours or more (full day)
        (endMinutesFromDay - startMinutesFromDay >= 1440)
      ) ||
      // Alternative: event spans 24+ hours (some calendar systems)
      ((endMinutesFromDay - startMinutesFromDay) >= 1440) ||
      // Alternative: explicit all-day flag from calendar (if available)
      (ev as any).allDay === true;
    
    // Debug all-day detection for events starting at midnight or suspicious events
    const isLassonde = ev.summary?.toLowerCase().includes('lassonde');
    const isBirthday = ev.summary?.toLowerCase().includes('birthday');
    const isElectric = ev.summary?.toLowerCase().includes('electric');
    
    if (startParts.hour === 0 && startParts.minute === 0 || isLassonde || isBirthday || isElectric) {
      console.log(`[WeeklyCalendar] EVENT DEBUG "${ev.summary}":`, {
        originalStart: ev.start,
        originalEnd: ev.end,
        startParts: startParts,
        endParts: endParts,
        startHour: startParts.hour,
        startMinute: startParts.minute,
        endHour: endParts.hour,
        endMinute: endParts.minute,
        duration: endMinutesFromDay - startMinutesFromDay,
        isAllDay: isAllDay,
        calendarUrl: ev.calendarUrl,
        platform: ev.calendarUrl?.includes('icloud.com') ? 'iCloud' : 'Google',
        allDayFlag: (ev as any).allDay,
        isRecurring: ev.isRecurring,
        rrule: ev.rrule,
        recurrence: ev.recurrence
      });
    }
    
    if (isAllDay) {
      // Handle all-day events
      console.log(`[WeeklyCalendar] ALL-DAY EVENT DETECTED: "${ev.summary}" from ${ev.calendarUrl?.includes('icloud.com') ? 'iCloud' : 'Google'}`);
      if (dateKey in allDayEventsByDay) {
        allDayEventsByDay[dateKey].push(ev);
      }
      continue; // Skip processing as timed event
    }
    
    if (!(dateKey in eventsByDay)) continue;
    

    const windowStartMinutes = startHour * 60;
    const windowEndMinutes = endHour * 60;
    
    // Show events within the expanded time window (6 AM - 8 PM)
    const clampedStart = Math.max(startMinutesFromDay, windowStartMinutes);
    const clampedEnd = Math.min(endMinutesFromDay, windowEndMinutes);
    
    // Skip events that fall completely outside the display window
    if (clampedEnd <= windowStartMinutes || clampedStart >= windowEndMinutes) {
      console.log(`[WeeklyCalendar] Skipping event "${ev.summary}" outside window: ${startParts.hour}:${startParts.minute} (${startMinutesFromDay} minutes)`);
      continue;
    }
    
    // Debug Lassonde event positioning specifically
    if (ev.summary?.toLowerCase().includes('lassonde')) {
      console.log(`[WeeklyCalendar] LASSONDE POSITIONING "${ev.summary}":`, {
        startMinutesFromDay: startMinutesFromDay,
        windowStartMinutes: windowStartMinutes,
        windowEndMinutes: windowEndMinutes,
        clampedStart: clampedStart,
        clampedEnd: clampedEnd,
        relativeStart: clampedStart - windowStartMinutes,
        startHour: startHour,
        endHour: endHour
      });
    }
    
    console.log(`[WeeklyCalendar] Processing event "${ev.summary}" at ${startParts.hour}:${startParts.minute}`);
    
    const relativeStart = clampedStart - windowStartMinutes; // minutes from top window
    const relativeDuration = clampedEnd - clampedStart; // minutes length
    // Color priority: user override > event color > stored config color > default
    const userOverrideColor = config?.colors?.[ev.calendarUrl];
    const baseColor = userOverrideColor || ev.color || '#3aa7e7';
    
    // Debug Lassonde event storage specifically
    if (ev.summary?.toLowerCase().includes('lassonde')) {
      console.log(`[WeeklyCalendar] LASSONDE STORAGE "${ev.summary}":`, {
        __startMinutes: relativeStart,
        __durationMinutes: relativeDuration,
        expectedPosition: `${relativeStart} minutes from window start (${startHour} AM)`,
        shouldShowAt: `${Math.floor(relativeStart / 60)}:${String(relativeStart % 60).padStart(2, '0')} after ${startHour} AM`
      });
    }
    
    (eventsByDay[dateKey] as any).push({
      ...ev,
      __top: relativeStart / daySpanMinutes,
      __height: relativeDuration / daySpanMinutes,
      __lane: 0,
      __baseColor: baseColor,
      __startMinutes: relativeStart,
      __durationMinutes: relativeDuration
    });
  }

  // Build overlap slices (only overlapping vertical segments, striped with both colors)
  Object.keys(eventsByDay).forEach(key => {
    const list = eventsByDay[key];
    list.sort((a,b)=> a.__startMinutes - b.__startMinutes);
    overlapSlices[key] = [];
    for (let i=0;i<list.length;i++) {
      const a = list[i];
      const aStart = a.__startMinutes;
      const aEnd = aStart + a.__durationMinutes;
      for (let j=i+1;j<list.length;j++) {
        const b = list[j];
        const bStart = b.__startMinutes;
        if (bStart >= aEnd) break;
        const bEnd = bStart + b.__durationMinutes;
        const oStart = Math.max(aStart, bStart);
        const oEnd = Math.min(aEnd, bEnd);
        if (oEnd <= oStart) continue;
        const duration = oEnd - oStart;
        const aFull = oStart === aStart && oEnd === aEnd;
        const bFull = oStart === bStart && oEnd === bEnd;
        // The overlap should show the SECOND event's title (event B) as the header
        // since the overlap represents the continuation/extension of event B
        const labelCandidate = b.summary; // Always show the second event's title
        const topRounded = (aStart === oStart && bStart === oStart);
        const bottomRounded = (aEnd === oEnd && bEnd === oEnd);
        // Generate a unique group ID for connected overlapping events
        const groupId = `${key}-${a.uid}-${b.uid}`;
        overlapSlices[key].push({
          startMinutes: oStart,
          durationMinutes: duration,
          colors:[a.__baseColor || '#3aa7e7', b.__baseColor || '#2ecc71'],
          titles:[a.summary, b.summary],
            label: labelCandidate,
            topRounded,
            bottomRounded,
            aIndex:i,
            bIndex:j,
            groupId
        });
        // mark full overlap events so we can hide their internal content
        if (aFull) (a as any).__fullOverlap = true;
        if (bFull) (b as any).__fullOverlap = true;
      }
    }
  });

  // Debug: log modal state on every render
  // (removed)
  // Format current week range like "October 2024"
  const formatWeekRange = () => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    if (weekStart.getMonth() === weekEnd.getMonth()) {
      return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    } else {
      return `${MONTH_NAMES[weekStart.getMonth()]} – ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
    }
  };

  return (
    <div className={styles.weeklyCalendar}>
      {/* Clean header like iCloud */}
      <div className={styles.calendarHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.monthYear}>{formatWeekRange()}</div>
          {loading && (
            <div className={styles.loadingIndicator}>
              <div className={styles.loadingSpinner}></div>
              <span>Loading events...</span>
            </div>
          )}
        </div>
        <div className={styles.headerNav}>
          <button className={styles.navArrow} onClick={() => navigateWeek("prev")}>‹</button>
          <button className={styles.todayButton} onClick={goToCurrentWeek}>Today</button>
          <button className={styles.navArrow} onClick={() => navigateWeek("next")}>›</button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className={styles.calendarContainer}>
        {loading && (
          <div className={styles.calendarLoadingOverlay}>
            <div className={styles.loadingSpinner}></div>
            <div>Loading calendar events...</div>
          </div>
        )}
        
        {/* Day headers - clean and minimal like iCloud */}
        <div className={styles.dayHeaderGrid}>
          <div className={styles.timeColumnHeader}></div>
          {weekDates.map((date, idx) => {
            const isToday = date.toDateString() === nowDate.toDateString();
            return (
              <div
                key={idx}
                className={`${styles.dayHeaderCell} ${isToday ? styles.todayHeader : ""}`}
                onClick={() => setSelectedDay(date.getDate())}
              >
                <div className={styles.dayName}>
                  {date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                </div>
                <div className={`${styles.dayDate} ${isToday ? styles.todayDate : ""}`}>
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* All-day events section */}
        <div className={styles.allDaySection}>
          <div className={styles.allDayTimeColumn}>
            <span className={styles.allDayLabel}>all-day</span>
          </div>
          {weekDates.map((date, idx) => {
            const dateKey = dayKeyFromISO(date.toISOString());
            const allDayList = allDayEventsByDay[dateKey] || [];
            const isToday = date.toDateString() === nowDate.toDateString();
            
            return (
              <div key={idx} className={`${styles.allDayColumn} ${isToday ? styles.todayAllDay : ""}`}>
                {allDayList.map((ev, i) => {
                  const userOverrideColor = config?.colors?.[ev.calendarUrl];
                  const baseColor = userOverrideColor || ev.color || "#3aa7e7";
                  const whitelisted = ev.uid && config?.whitelist.includes(ev.uid);
                  const isBusy = (ev.blocking && !whitelisted) || busySet.has(ev.calendarUrl);
                  const eventColor = isBusy ? baseColor : shadeColor(baseColor, -20);
                  
                  return (
                    <div
                      key={i}
                      className={styles.allDayEvent}
                      style={{
                        backgroundColor: eventColor,
                        borderColor: shadeColor(eventColor, 20)
                      }}
                      title={ev.summary}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEvent(ev);
                      }}
                    >
                      {ev.summary}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Main calendar grid */}
        <div className={styles.calendarGrid}>
          {/* Time column with clean labels */}
          <div className={styles.timeColumn}>
            {hourRange.map(hour => (
              <div key={hour} className={styles.timeSlot}>
                <span className={styles.timeLabel}>{formatHour(hour)}</span>
              </div>
            ))}
          </div>
          {/* Day columns with clean event display */}
          {weekDates.map((date, idx) => {
            const dateKey = dayKeyFromISO(date.toISOString());
            const dayList = eventsByDay[dateKey] || [];
            const stripes = overlapSlices[dateKey] || [];
            const isToday = dayKeyFromISO(date.toISOString()) === dayKeyFromISO(nowDate.toISOString());
            
            // Get business hours for this day
            const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            const dayHours = hours?.[dayName];
            
            return (
              <div key={idx} className={`${styles.dayGrid} ${isToday ? styles.todayGrid : ""}`}>
                {/* Hour grid lines */}
                {hourRange.map(hour => (
                  <div key={hour} className={styles.hourLine}></div>
                ))}
                
                {/* Business hours indicators */}
                {dayHours && (
                  <>
                    {/* Opening time line */}
                    <div 
                      className={styles.businessHourLine}
                      style={{
                        top: `calc((${dayHours.startMinutes} - ${startHour * 60}) * (var(--hour-height) / 60))`,
                        borderTop: '2px solid #4ade80'
                      }}
                      title={`Opens: ${Math.floor(dayHours.startMinutes / 60)}:${String(dayHours.startMinutes % 60).padStart(2, '0')}`}
                    />
                    {/* Closing time line */}
                    <div 
                      className={styles.businessHourLine}
                      style={{
                        top: `calc((${dayHours.endMinutes} - ${startHour * 60}) * (var(--hour-height) / 60))`,
                        borderTop: '2px solid #f87171'
                      }}
                      title={`Closes: ${Math.floor(dayHours.endMinutes / 60)}:${String(dayHours.endMinutes % 60).padStart(2, '0')}`}
                    />
                  </>
                )}
                
                {/* Current time line - only show on today's column */}
                {isToday && (() => {
                  const now = new Date();
                  const nowMinutes = now.getHours() * 60 + now.getMinutes();
                  const windowStartMinutes = startHour * 60;
                  const windowEndMinutes = endHour * 60;
                  
                  // Only show if current time is within the visible window
                  if (nowMinutes >= windowStartMinutes && nowMinutes <= windowEndMinutes) {
                    return (
                      <div
                        className={styles.currentTimeLine}
                        style={{
                          top: `calc((${nowMinutes} - ${startHour * 60}) * (var(--hour-height) / 60))`,
                          position: 'absolute',
                          left: '0',
                          right: '0',
                          height: '3px',
                          background: 'linear-gradient(90deg, #4e8cff 0%, #3aa7e7 100%)',
                          borderRadius: '2px',
                          zIndex: 25,
                          boxShadow: '0 0 12px rgba(78, 140, 255, 0.6)',
                          border: '1px solid rgba(78, 140, 255, 0.3)'
                        }}
                        title={`Current time: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      />
                    );
                  }
                  return null;
                })()}
                
                {/* Events layer */}
                <div className={styles.eventsContainer}>
                  {/* Overlap stripes */}
                  {stripes.map((s,i) => {
                    const eventA = eventsByDay[dateKey][s.aIndex];
                    const eventB = eventsByDay[dateKey][s.bIndex];
                    const colorA = eventA.__baseColor || '#3aa7e7';
                    const colorB = eventB.__baseColor || '#2ecc71';
                    
                    // Determine which event is visually on top (starts earlier) vs bottom (ends later)
                    const eventAStartsEarlier = eventA.__startMinutes <= eventB.__startMinutes;
                    const topEventIndex = eventAStartsEarlier ? s.aIndex : s.bIndex;
                    const bottomEventIndex = eventAStartsEarlier ? s.bIndex : s.aIndex;
                    
                    // Check hover state - only highlight if this specific overlap is hovered (overlap-only mode)
                    const isOverlapHovered = hoveredEventGroup === s.groupId && hoverType === 'overlap-only';
                    // Check if part of full group hover from regular event
                    const isPartOfGroupHover = hoveredEventGroup === s.groupId && hoverType === 'full-group';
                    
                    // Create interlocking pattern with selective brightening
                    let baseColor = colorA; // Background color (eventA)  
                    let stripeColor = colorB; // Stripe color (eventB)
                    
                    // Brighten colors when parent events are hovered OR when overlap itself is hovered
                    if (isPartOfGroupHover) {
                      if (hoveredEventIndex === s.aIndex) {
                        // EventA is hovered - brighten background using EXACT same formula as regular events
                        baseColor = `color-mix(in srgb, ${colorA} 85%, white 15%)`;
                      } else if (hoveredEventIndex === s.bIndex) {
                        // EventB is hovered - brighten stripes using EXACT same formula as regular events
                        stripeColor = `color-mix(in srgb, ${colorB} 85%, white 15%)`;
                      }
                    } else if (isOverlapHovered) {
                      // When overlap itself is hovered, brighten both colors using EXACT same formula
                      baseColor = `color-mix(in srgb, ${colorA} 85%, white 15%)`;
                      stripeColor = `color-mix(in srgb, ${colorB} 85%, white 15%)`;
                    }
                    
                    // Apply transform and shadow when parent events OR overlap itself is hovered
                    const shouldTransform = isPartOfGroupHover || isOverlapHovered;
                    const transformStyle = shouldTransform ? 'translateY(-1px)' : 'none';
                    
                    // Add shadow when overlap is hovered directly for better visual feedback
                    const shadowStyle = isOverlapHovered ? '0 2px 8px rgba(0,0,0,0.3)' : 'none';
                    
                    // Apply brightness filter when parent events are hovered to match regular event hover
                    const filterStyle = isPartOfGroupHover ? 'brightness(1.1)' : 'none';
                    
                    return (
                      <div 
                        key={i} 
                        className={`${styles.overlapEvent} ${(s.topRounded) ? styles.roundedTop : ''} ${(s.bottomRounded) ? styles.roundedBottom : ''}`}
                        style={{
                          top: `calc(${s.startMinutes} * (var(--hour-height)/60))`,
                          height: `calc(${s.durationMinutes} * (var(--hour-height)/60))`,
                          backgroundColor: baseColor,
                          // FIXED: Restore working diagonal stripes
                          backgroundImage: `repeating-linear-gradient(-45deg, ${stripeColor}, ${stripeColor} 4px, ${baseColor} 4px, ${baseColor} 8px)`,
                          transform: transformStyle,
                          boxShadow: shadowStyle,
                          filter: filterStyle,
                          transition: 'all 0.15s ease',
                          cursor: 'pointer',
                          // Simple working border styling - only show borders when actively hovering
                          border: (isOverlapHovered || isPartOfGroupHover) ? 
                            (isOverlapHovered ? `1px solid ${stripeColor}` : `1px solid rgba(255, 255, 255, 0.2)`) : 
                            'none',
                          // FIXED: When hovering top event, stripe shows rounded bottom; when hovering bottom event, stripe shows rounded top
                          borderRadius: isPartOfGroupHover ? 
                            (hoveredEventIndex === topEventIndex ? '0px 0px 4px 4px' : 
                             hoveredEventIndex === bottomEventIndex ? '4px 4px 0px 0px' : '4px') : 
                            '4px',
                          // FIXED: Border logic - when hovering an event, remove the border that connects to that event, keep the border that shows the extent
                          borderTop: (isPartOfGroupHover && hoveredEventIndex === topEventIndex) ? 'none' : undefined,
                          borderBottom: (isPartOfGroupHover && hoveredEventIndex === bottomEventIndex) ? 'none' : undefined,
                          // FIXED: Margin adjustments - overlap with the hovered event for seamless connection
                          marginTop: isPartOfGroupHover && hoveredEventIndex === topEventIndex ? '-2px' : '0',
                          marginBottom: isPartOfGroupHover && hoveredEventIndex === bottomEventIndex ? '-2px' : '0',
                          zIndex: 3
                        }}
                        onMouseEnter={() => {
                          setHoveredEventGroup(s.groupId);
                          setHoverType('overlap-only');
                          setHoveredEventIndex(null); // Clear specific event index for overlap hover
                        }}
                        onMouseLeave={() => {
                          setHoveredEventGroup(null);
                          setHoverType(null);
                          setHoveredEventIndex(null);
                          setHoveredEventDay(null); // Clear hovered day
                        }}
                        onClick={() => setOverlapEvents([eventA, eventB])}
                      >
                        <span className={styles.overlapLabel}>{s.label}</span>
                      </div>
                    );
                  })}
                  
                  {/* Regular events - clean iCloud style */}
                  {dayList.map((ev, i) => {
                    // DEBUG: Log what events are being rendered for this day
                    const dayDateStr = date.toISOString().split('T')[0];
                    if (ev.summary?.toLowerCase().includes('acctg') || 
                        ev.summary?.toLowerCase().includes('lassonde') ||
                        ev.summary?.toLowerCase().includes('exam')) {
                      console.log(`[WeeklyCalendar] RENDERING EVENT "${ev.summary}" on ${dayDateStr}:`, {
                        eventIndex: i,
                        start: ev.start,
                        startLocal: new Date(ev.start).toLocaleString(),
                        end: ev.end,
                        endLocal: ev.end ? new Date(ev.end).toLocaleString() : null,
                        uid: ev.uid,
                        calendar: ev.calendar,
                        calendarUrl: ev.calendarUrl,
                        isRecurring: ev.isRecurring,
                        rrule: ev.rrule
                      });
                    }
                    
                    // Parse times directly without timezone conversion (already Mountain Time)
                    const startParts = getDateParts(ev.start);
                    const endParts = ev.end ? getDateParts(ev.end) : null;
                    
                    // Format times for display without timezone conversion
                    const formatDisplayTime = (hour: number, minute: number) => {
                      const displayHour = hour % 12 || 12;
                      const ampm = hour >= 12 ? 'PM' : 'AM';
                      return `${displayHour}:${String(minute).padStart(2, '0')} ${ampm}`;
                    };
                    
                    const startDisplayTime = formatDisplayTime(startParts.hour, startParts.minute);
                    const endDisplayTime = endParts ? formatDisplayTime(endParts.hour, endParts.minute) : null;
                    
                    // Use original Date objects for ongoing calculation (but not for display)
                    const startDate = new Date(ev.start);
                    const endDate = ev.end ? new Date(ev.end) : new Date(startDate.getTime() + 30*60000);
                    const isOngoing = nowTick >= startDate.getTime() && nowTick < endDate.getTime();
                    
                    const whitelisted = ev.uid && config?.whitelist.includes(ev.uid);
                    const userOverrideColor = config?.colors?.[ev.calendarUrl];
                    const baseColor = userOverrideColor || ev.__baseColor || ev.color || "#3aa7e7";
                    const isBusy = (ev.blocking && !whitelisted) || busySet.has(ev.calendarUrl);
                    const eventColor = isBusy ? baseColor : shadeColor(baseColor, -20);
                    const small = ev.__durationMinutes < 30;
                    const hideContent = (ev as any).__fullOverlap;
                    
                    if (hideContent) return null;
                    
                    // Check if this event participates in any overlap group
                    const participatesInOverlap = stripes.some(s => 
                      s.aIndex === i || s.bIndex === i
                    );
                    const eventGroupIds = stripes
                      .filter(s => s.aIndex === i || s.bIndex === i)
                      .map(s => s.groupId);
                    const isPartOfHoveredGroup = eventGroupIds.some(id => id === hoveredEventGroup) && hoverType === 'full-group';
                    
                    // For overlapping events: only brighten if this specific event is hovered OR part of group hover
                    // For non-overlapping events: use normal hover behavior
                    const isThisSpecificEventHovered = hoveredEventIndex === i && hoveredEventDay === dateKey;
                    const shouldBrighten = isThisSpecificEventHovered || isPartOfHoveredGroup;
                    
                    // Brighten color and add hover effect
                    const finalEventColor = shouldBrighten ? 
                      `color-mix(in srgb, ${eventColor} 85%, white 15%)` : 
                      eventColor;
                    const finalBorderColor = shouldBrighten ? 
                      `color-mix(in srgb, ${shadeColor(eventColor, 20)} 85%, white 15%)` : 
                      shadeColor(eventColor, 20);
                    
                    return (
                      <div
                        key={i}
                        className={`${styles.event} ${small ? styles.eventSmall : ''} ${isOngoing ? styles.eventOngoing : ''} ${shouldBrighten ? styles.hoveredGroup : ''}`}
                        style={{
                          top: `calc(${ev.__startMinutes} * (var(--hour-height) / 60))`,
                          height: `calc(${ev.__durationMinutes} * (var(--hour-height) / 60))`,
                          backgroundColor: finalEventColor,
                          borderColor: finalBorderColor,
                          boxShadow: shouldBrighten ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                          // FIXED: Only modify border radius for overlapping events when part of a group hover (seamless card mode)
                          borderRadius: (participatesInOverlap && isPartOfHoveredGroup) ? 
                            (() => {
                              // Find which overlap this event participates in
                              const relevantStripe = eventGroupIds.map(id => stripes.find(s => s.groupId === id && (s.aIndex === i || s.bIndex === i))).find(s => s);
                              if (!relevantStripe) return '4px';
                              
                              const eventA = eventsByDay[dateKey][relevantStripe.aIndex];
                              const eventB = eventsByDay[dateKey][relevantStripe.bIndex];
                              const eventAStartsEarlier = eventA.__startMinutes <= eventB.__startMinutes;
                              const topEventIndex = eventAStartsEarlier ? relevantStripe.aIndex : relevantStripe.bIndex;
                              const bottomEventIndex = eventAStartsEarlier ? relevantStripe.bIndex : relevantStripe.aIndex;
                              
                              // Only modify border radius when showing seamless group card
                              if (hoveredEventIndex === topEventIndex && i === topEventIndex) {
                                return '4px 4px 0px 0px'; // Top event: rounded top, flat bottom
                              } else if (hoveredEventIndex === bottomEventIndex && i === bottomEventIndex) {
                                return '0px 0px 4px 4px'; // Bottom event: flat top, rounded bottom  
                              } else if (hoveredEventIndex === topEventIndex && i === bottomEventIndex) {
                                return '0px 0px 4px 4px'; // Bottom event when top is hovered: match stripe
                              } else if (hoveredEventIndex === bottomEventIndex && i === topEventIndex) {
                                return '4px 4px 0px 0px'; // Top event when bottom is hovered: match stripe
                              }
                              return '4px';
                            })() : 
                            '4px', // All other events always get full rounded corners
                          // FIXED: Only remove borders for seamless connection during group hover
                          borderBottom: (participatesInOverlap && isPartOfHoveredGroup && 
                            eventGroupIds.some(id => {
                              const stripe = stripes.find(s => s.groupId === id && (s.aIndex === i || s.bIndex === i));
                              if (!stripe) return false;
                              const eventA = eventsByDay[dateKey][stripe.aIndex];
                              const eventB = eventsByDay[dateKey][stripe.bIndex];
                              const eventAStartsEarlier = eventA.__startMinutes <= eventB.__startMinutes;
                              const bottomEventIndex = eventAStartsEarlier ? stripe.bIndex : stripe.aIndex;
                              return bottomEventIndex === i && hoveredEventIndex === i;
                            })) ? 'none' : undefined,
                          borderTop: (participatesInOverlap && isPartOfHoveredGroup && 
                            eventGroupIds.some(id => {
                              const stripe = stripes.find(s => s.groupId === id && (s.aIndex === i || s.bIndex === i));
                              if (!stripe) return false;
                              const eventA = eventsByDay[dateKey][stripe.aIndex];
                              const eventB = eventsByDay[dateKey][stripe.bIndex];
                              const eventAStartsEarlier = eventA.__startMinutes <= eventB.__startMinutes;
                              const topEventIndex = eventAStartsEarlier ? stripe.aIndex : stripe.bIndex;
                              return topEventIndex === i && hoveredEventIndex === i;
                            })) ? 'none' : undefined,
                          // FIXED: Only adjust margins during group hover seamless connection
                          marginBottom: (participatesInOverlap && isPartOfHoveredGroup && 
                            eventGroupIds.some(id => {
                              const stripe = stripes.find(s => s.groupId === id && (s.aIndex === i || s.bIndex === i));
                              if (!stripe) return false;
                              const eventA = eventsByDay[dateKey][stripe.aIndex];
                              const eventB = eventsByDay[dateKey][stripe.bIndex];
                              const eventAStartsEarlier = eventA.__startMinutes <= eventB.__startMinutes;
                              const bottomEventIndex = eventAStartsEarlier ? stripe.bIndex : stripe.aIndex;
                              return bottomEventIndex === i && hoveredEventIndex === i;
                            })) ? '-2px' : '0',
                          marginTop: (participatesInOverlap && isPartOfHoveredGroup && 
                            eventGroupIds.some(id => {
                              const stripe = stripes.find(s => s.groupId === id && (s.aIndex === i || s.bIndex === i));
                              if (!stripe) return false;
                              const eventA = eventsByDay[dateKey][stripe.aIndex];
                              const eventB = eventsByDay[dateKey][stripe.bIndex];
                              const eventAStartsEarlier = eventA.__startMinutes <= eventB.__startMinutes;
                              const topEventIndex = eventAStartsEarlier ? stripe.aIndex : stripe.bIndex;
                              return topEventIndex === i && hoveredEventIndex === i;
                            })) ? '-2px' : '0',
                          transition: 'all 0.15s ease'
                        }}
                        title={`${ev.summary}\n${startDisplayTime}${endDisplayTime ? ` - ${endDisplayTime}` : ''}`}
                        onMouseEnter={() => {
                          if (participatesInOverlap && eventGroupIds.length > 0) {
                            setHoveredEventGroup(eventGroupIds[0]); // Use first group if multiple
                            setHoverType('full-group'); // This triggers group hover for overlaps/stripes
                            setHoveredEventIndex(i); // Track which specific event is hovered for individual brightening
                            setHoveredEventDay(dateKey); // Track which day is hovered
                          } else {
                            // For non-overlapping events, use the group behavior as before
                            setHoveredEventGroup(null);
                            setHoverType('full-group');
                            setHoveredEventIndex(i);
                            setHoveredEventDay(dateKey); // Track which day is hovered
                          }
                        }}
                        onMouseLeave={() => {
                          setHoveredEventGroup(null);
                          setHoverType(null);
                          setHoveredEventIndex(null);
                          setHoveredEventDay(null); // Clear hovered day
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(ev);
                        }}
                      >
                        <div className={styles.eventTitle}>{ev.summary}</div>
                        {!small && (
                          <div className={styles.eventTime}>
                            {startDisplayTime}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals */}
      {selectedDay !== null && (() => {
        // FIXED: Find the correct date from weekDates instead of using weekStart
        const selectedDate = weekDates.find(d => d.getDate() === selectedDay);
        if (!selectedDate) return null;
        
        // Use the same key generation method as used for eventsByDay
        const key = dayKeyFromISO(selectedDate.toISOString());
        const timedEvents = eventsByDay[key] || [];
        const allDayEvents = allDayEventsByDay[key] || [];
        const combinedEvents = [...timedEvents, ...allDayEvents];
        
        console.log(`[WeeklyCalendar] FIXED date calculation for day ${selectedDay}:`, {
          selectedDate: selectedDate.toISOString().split('T')[0],
          day: selectedDate.getDate(),
          month: selectedDate.getMonth() + 1,
          year: selectedDate.getFullYear(),
          key,
          timedCount: timedEvents.length,
          allDayCount: allDayEvents.length,
          totalCount: combinedEvents.length,
          availableKeys: Object.keys(eventsByDay),
          eventsByDayKeys: Object.keys(eventsByDay),
          allDayEventsByDayKeys: Object.keys(allDayEventsByDay)
        });
        
        return (
          <DayEventsModal
            day={selectedDate.getDate()}
            month={selectedDate.getMonth() + 1}
            year={selectedDate.getFullYear()}
            events={combinedEvents}
          config={config}
          hours={hours}
          onClose={() => {
            setSelectedDay(null);
            onConfigRefresh && onConfigRefresh();
          }}
          onConfigUpdate={() => {
            onConfigRefresh && onConfigRefresh();
            // Reload week after config update (e.g. after scheduling)
            loadWeek();
          }}
          onNavigateDay={(direction) => {
            // Navigate to the next or previous day
            const currentDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
            const newDate = new Date(currentDate);
            newDate.setDate(currentDate.getDate() + (direction === 'next' ? 1 : -1));
            
            // Update selected day to the new date
            setSelectedDay(newDate.getDate());
            
            // If the new date is in a different week, navigate to that week
            const newWeekStart = getWeekStart(newDate);
            if (newWeekStart.getTime() !== weekStart.getTime()) {
              setWeekStart(newWeekStart);
            }
          }}
          footer={
            <button
              style={{ margin: '16px 0 0 0', padding: '8px 16px', fontWeight: 600, borderRadius: 8, background: '#222', color: '#fff', border: '1px solid #444', cursor: 'pointer' }}
              onClick={() => {
                setShowQuickSchedule(true);
                setQuickScheduleDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()));
              }}
            >
              + Schedule appointment
            </button>
          }
        />
      );
      })()}
      {selectedEvent !== null && (
        <EventModal
          event={selectedEvent}
          config={config}
          onClose={() => setSelectedEvent(null)}
        />
      )}
      {overlapEvents !== null && (
        <OverlapModal
          events={overlapEvents}
          config={config}
          onClose={() => setOverlapEvents(null)}
          onEventSelect={(event) => {
            setOverlapEvents(null);
            setSelectedEvent(event);
          }}
        />
      )}
      {showQuickSchedule && quickScheduleDate && (
        <ScheduleAppointmentModal
          open={showQuickSchedule}
          onClose={() => setShowQuickSchedule(false)}
          onScheduled={() => {
            setShowQuickSchedule(false);
            onConfigRefresh && onConfigRefresh();
            window.dispatchEvent(new CustomEvent('calendar-refresh'));
          }}
          defaultDate={quickScheduleDate.toISOString().split('T')[0]}
        />
      )}
    </div>
  );
};
