import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { http } from "../lib/http";
import { CalendarEvent, CalendarConfig } from "../types/calendar";
import { DayEventsModal } from "./DayEventsModal";
import { ScheduleAppointmentModal } from "./ScheduleAppointmentModal";
import { EventModal } from "./EventModal";
import styles from "./calendar.module.css";

interface WeeklyCalendarProps {
  config: CalendarConfig | null;
  hours?: {
    [day: string]: { raw: string; startMinutes: number; endMinutes: number };
  } | null;
  onConfigRefresh?: () => void; // trigger refetch after modal actions
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
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  // Remove selectedDayEvents state, use week cache
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [dayModalLoading, setDayModalLoading] = useState(false);
  const [showQuickSchedule, setShowQuickSchedule] = useState(false);
  const [quickScheduleDate, setQuickScheduleDate] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // (removed erroneous duplicate imports)

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Load events when week changes or when a calendar-refresh event is fired

  // Robust fetch: only set state for latest request
  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    const fetchWeek = async () => {
      try {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        
        const params: any = {
          start: weekStart.toISOString().split("T")[0],
          end: weekEnd.toISOString().split("T")[0],
        };
        
        console.log(`[WeeklyCalendar] Fetching events for ${params.start} to ${params.end}`);
        const data = await http.get<any>("/api/merged/week", params);
        console.log(`[WeeklyCalendar] Received ${data.events?.length || 0} events:`, data.events);
        if (isCurrent) {
          setEvents(data.events || []);
        }
      } catch (error) {
        if (isCurrent) setEvents([]);
        console.error("[WeeklyCalendar] Error loading week events:", error);
      } finally {
        if (isCurrent) setLoading(false);
      }
    };
    fetchWeek();
    const handler = () => fetchWeek();
    window.addEventListener('calendar-refresh', handler);
    return () => {
      isCurrent = false;
      window.removeEventListener('calendar-refresh', handler);
    };
  }, [weekStart, config]);

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
  const overlapSlices: Record<string, { startMinutes:number; durationMinutes:number; colors:[string,string]; titles:[string,string]; label:string; topRounded:boolean; bottomRounded:boolean; aIndex:number; bIndex:number }[]> = {};
  // --- Date parsing helpers for calendar display ---
  // The backend normalizes timestamps to .000Z format, but they represent local Mountain Time
  function getDateParts(dateISO: string) {
    try {
      // Parse the ISO string directly as local time (no timezone conversion)
      // The server already normalizes timestamps to represent Mountain Time
      const match = dateISO.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.000Z$/);
      if (match) {
        const [, year, month, day, hour, minute] = match;
        return {
          year,
          month,
          day,
          hour: parseInt(hour, 10),
          minute: parseInt(minute, 10),
        };
      }
      
      // Fallback to Date parsing (but this may cause timezone issues)
      const date = new Date(dateISO);
      return {
        year: date.getFullYear().toString(),
        month: (date.getMonth() + 1).toString().padStart(2, '0'),
        day: date.getDate().toString().padStart(2, '0'),
        hour: date.getHours(),
        minute: date.getMinutes(),
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

  // Pre-filter events by config (after fetch) - show ALL events from configured calendars
  const busySet = new Set(
    (config?.calendars || []).filter((c) => c.busy).map((c) => c.url)
  );
  const forcedBusy = new Set(config?.busyEvents || []);
  const configuredCalendars = new Set(
    (config?.calendars || []).map((c) => c.url)
  );
  
  const relevantEvents = events.filter((ev) => {
    if (!config) return true; // show until config loaded
    
    // Filter out declined events
    if (ev.responseStatus === 'declined' || ev.status === 'declined') {
      return false;
    }
    
    // Show events from ANY configured calendar (not just busy ones)
    return configuredCalendars.has(ev.calendarUrl) || (ev.uid && forcedBusy.has(ev.uid));
  });

  // Debug: log configuration and events
  console.log(`[WeeklyCalendar] Config calendars:`, config?.calendars?.map(c => ({url: c.url, busy: c.busy})));
  console.log(`[WeeklyCalendar] Total events from backend: ${events.length}`);
  console.log(`[WeeklyCalendar] Filtered relevant events: ${relevantEvents.length}`);
  
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
    
    // Debug all-day detection
    if (startParts.hour === 0 && startParts.minute === 0) {
      console.log(`[WeeklyCalendar] ALL-DAY CHECK "${ev.summary}":`, {
        startHour: startParts.hour,
        startMinute: startParts.minute,
        endHour: endParts.hour,
        endMinute: endParts.minute,
        duration: endMinutesFromDay - startMinutesFromDay,
        isAllDay: isAllDay
      });
    }
    
    if (isAllDay) {
      // Handle all-day events
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
        const labelCandidate = aFull && !bFull ? a.summary : bFull && !aFull ? b.summary : (a.__durationMinutes <= b.__durationMinutes ? a.summary : b.summary);
        const topRounded = (aStart === oStart && bStart === oStart);
        const bottomRounded = (aEnd === oEnd && bEnd === oEnd);
        overlapSlices[key].push({
          startMinutes: oStart,
          durationMinutes: duration,
          colors:[a.__baseColor || '#3aa7e7', b.__baseColor || '#2ecc71'],
          titles:[a.summary, b.summary],
            label: labelCandidate,
            topRounded,
            bottomRounded,
            aIndex:i,
            bIndex:j
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
          {loading && <div className={styles.loadingIndicator}>•</div>}
        </div>
        <div className={styles.headerNav}>
          <button className={styles.navArrow} onClick={() => navigateWeek("prev")}>‹</button>
          <button className={styles.todayButton} onClick={goToCurrentWeek}>Today</button>
          <button className={styles.navArrow} onClick={() => navigateWeek("next")}>›</button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className={styles.calendarContainer}>
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
                
                {/* Events layer */}
                <div className={styles.eventsContainer}>
                  {/* Overlap stripes */}
                  {stripes.map((s,i) => {
                    const eventA = eventsByDay[dateKey][s.aIndex];
                    const eventB = eventsByDay[dateKey][s.bIndex];
                    const colorA = eventA.__baseColor || '#3aa7e7';
                    const colorB = eventB.__baseColor || '#2ecc71';
                    return (
                      <div 
                        key={i} 
                        className={`${styles.overlapEvent} ${s.topRounded ? styles.roundedTop : ''} ${s.bottomRounded ? styles.roundedBottom : ''}`}
                        style={{
                          top: `calc(${s.startMinutes} * (var(--hour-height)/60))`,
                          height: `calc(${s.durationMinutes} * (var(--hour-height)/60))`,
                          background: `repeating-linear-gradient(45deg, ${colorA} 0 8px, ${colorB} 8px 16px)`
                        }}
                      >
                        <span className={styles.overlapLabel}>{s.label}</span>
                      </div>
                    );
                  })}
                  
                  {/* Regular events - clean iCloud style */}
                  {dayList.map((ev, i) => {
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
                    
                    return (
                      <div
                        key={i}
                        className={`${styles.event} ${small ? styles.eventSmall : ''} ${isOngoing ? styles.eventOngoing : ''}`}
                        style={{
                          top: `calc(${ev.__startMinutes} * (var(--hour-height) / 60))`,
                          height: `calc(${ev.__durationMinutes} * (var(--hour-height) / 60))`,
                          backgroundColor: eventColor,
                          borderColor: shadeColor(eventColor, 20)
                        }}
                        title={`${ev.summary}\n${startDisplayTime}${endDisplayTime ? ` - ${endDisplayTime}` : ''}`}
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
      {selectedDay !== null && (
        <DayEventsModal
          day={selectedDay}
          month={weekStart.getMonth() + 1}
          year={weekStart.getFullYear()}
          events={(() => {
            // Find events for this day from week cache
            const date = new Date(weekStart);
            date.setDate(selectedDay);
            const key = date.toISOString().split('T')[0];
            return eventsByDay[key] || [];
          })()}
          config={config}
          onClose={() => {
            setSelectedDay(null);
            onConfigRefresh && onConfigRefresh();
          }}
          onConfigUpdate={() => {
            onConfigRefresh && onConfigRefresh();
            // Reload week after config update (e.g. after scheduling)
            loadWeek();
          }}
          footer={
            <button
              style={{ margin: '16px 0 0 0', padding: '8px 16px', fontWeight: 600, borderRadius: 8, background: '#222', color: '#fff', border: '1px solid #444', cursor: 'pointer' }}
              onClick={() => {
                setShowQuickSchedule(true);
                setQuickScheduleDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), selectedDay));
              }}
            >
              + Schedule appointment
            </button>
          }
        />
      )}
      {selectedEvent !== null && (
        <EventModal
          event={selectedEvent}
          config={config}
          onClose={() => setSelectedEvent(null)}
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
