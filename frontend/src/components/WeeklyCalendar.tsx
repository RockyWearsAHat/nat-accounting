import React, { useState, useEffect } from "react";
import { http } from "../lib/http";
import { CalendarEvent, CalendarConfig } from "../types/calendar";
import { DayEventsModal } from "./DayEventsModal";
import styles from "./calendar.module.css";

interface WeeklyCalendarProps {
  config: CalendarConfig | null;
  hours?: {
    [day: string]: { raw: string; startMinutes: number; endMinutes: number };
  } | null;
  timezone?: string;
  onConfigRefresh?: () => void; // trigger refetch after modal actions
}

export const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({
  config,
  hours,
  timezone,
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
  // Format hour label (12h)
  function formatHour(h:number, isHalf = false){
    if (isHalf) {
      return h === 0 ? "12:30 AM" : h < 12 ? `${h}:30 AM` : h === 12 ? "12:30 PM" : `${h-12}:30 PM`;
    }
    return h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h-12} PM`;
  }

  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<
    CalendarEvent[] | null
  >(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // (removed erroneous duplicate imports)

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Load events when week changes
  useEffect(() => {
    loadWeek();
  }, [weekStart]);

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

      const data = await http.get<any>("/api/merged/week", {
        start: weekStart.toISOString().split("T")[0],
        end: weekEnd.toISOString().split("T")[0],
      });
      console.log(`[WeeklyCalendar] Loaded ${data.events?.length || 0} events`);
      setEvents(data.events || []);
    } catch (error) {
      console.error("[WeeklyCalendar] Error loading week events:", error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // Load day events
  const loadDay = async (date: Date) => {
    try {
      const dateStr = date.toISOString().split("T")[0];
  const data = await http.get<any>("/api/icloud/day", { date: dateStr });
  setSelectedDayEvents(data.events || []);
    } catch (error) {
      console.error("[WeeklyCalendar] Error loading day events:", error);
      setSelectedDayEvents([]);
    }
  };

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

  // ----- Business hour window -----
  let startHour = 8;
  let endHour = 18;
  if (hours) {
    const vals = Object.values(hours).filter(Boolean) as any[];
    if (vals.length) {
      startHour = Math.floor(
        Math.min(...vals.map((v) => v.startMinutes)) / 60
      );
      endHour = Math.ceil(
        Math.max(...vals.map((v) => v.endMinutes)) / 60
      );
    }
  }
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
  // --- Timezone helpers ---
  const activeTZ = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  function getTzParts(dateISO:string){
    try {
      const d = new Date(dateISO);
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: activeTZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
      const parts = fmt.formatToParts(d);
      const grab = (t:string)=> parts.find(p=>p.type===t)?.value || '00';
      return {
        year: grab('year'), month: grab('month'), day: grab('day'),
        hour: parseInt(grab('hour'),10), minute: parseInt(grab('minute'),10)
      };
    } catch { return {year:'0000', month:'00', day:'00', hour:0, minute:0}; }
  }
  function dayKeyFromISO(dateISO:string){
    const p = getTzParts(dateISO);
    return `${p.year}-${p.month}-${p.day}`;
  }
  weekDates.forEach(d => {
    // derive key in timezone so week boundaries align visually
    const key = dayKeyFromISO(d.toISOString());
    eventsByDay[key] = [];
  });

  // Pre-filter events by config (after fetch) respecting busy calendars & forced busy events
  const busySet = new Set(
    (config?.calendars || []).filter((c) => c.busy).map((c) => c.url)
  );
  const forcedBusy = new Set(config?.busyEvents || []);
  const relevantEvents = events.filter((ev) => {
    if (!config) return true; // show until config loaded
    
    // Filter out declined events
    if (ev.responseStatus === 'declined' || ev.status === 'declined') {
      return false;
    }
    
    return busySet.has(ev.calendarUrl) || (ev.uid && forcedBusy.has(ev.uid));
  });

  for (const ev of relevantEvents) {
    const startParts = getTzParts(ev.start);
    const endParts = getTzParts(ev.end || ev.start);
    const dateKey = dayKeyFromISO(ev.start);
    if (!(dateKey in eventsByDay)) continue;
    const startMinutesFromDay = startParts.hour * 60 + startParts.minute;
    const endMinutesFromDay = (endParts.hour * 60 + endParts.minute) || (startMinutesFromDay + 30);
    const windowStartMinutes = startHour * 60;
    const windowEndMinutes = endHour * 60;
    const clampedStart = Math.max(startMinutesFromDay, windowStartMinutes);
    const clampedEnd = Math.min(endMinutesFromDay, windowEndMinutes);
    if (clampedEnd <= windowStartMinutes || clampedStart >= windowEndMinutes) continue;
  const relativeStart = clampedStart - windowStartMinutes; // minutes from top window
  const relativeDuration = clampedEnd - clampedStart; // minutes length
    const calendarColor = config?.colors?.[ev.calendarUrl];
    const baseColor = ev.color || calendarColor || '#3aa7e7';
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

  return (
    <div className={styles.weeklyCalendar}>
      <h3 className={styles.calendarTitle}>Calendar (Weekly View)</h3>

      <div className={styles.calendarNav}>
        <button className={styles.navButton} onClick={() => navigateWeek("prev")}>Prev</button>
        <button className={styles.navButton} onClick={() => navigateWeek("next")}>Next</button>
        <div className={styles.weekRange}>
          {weekStart.toLocaleDateString()} – {(() => { const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6); return weekEnd.toLocaleDateString(); })()}
        </div>
        <button className={styles.navButton} onClick={goToCurrentWeek}>This Week</button>
      </div>


      {/* Grid headers */}
      {/* Week header */}
      <div className={styles.dayHeaderRow}>
        <div className={styles.timeHeader}>Time</div>
        {weekDates.map((date, idx) => (
          <div key={idx} className={`${styles.dayHeader} ${date.toDateString() === nowDate.toDateString() ? styles.today : ""}`}>
            <div className={styles.dayWeekday}>{date.toLocaleDateString("en-US", { weekday: "short" })}</div>
            <div className={styles.dayNumber}>{date.getDate()}</div>
            <div className={styles.dayMonth}>{date.toLocaleDateString("en-US", { month: "short" })}</div>
          </div>
        ))}
      </div>
      {/* Body */}
      <div className={styles.calendarBody} style={{ minHeight: `calc(var(--hour-height) * ${Math.max(hourRange.length,10)})` }}>
        <div className={styles.gridOverlay} />
        {/* Time column */}
        <div className={styles.timeCol}>
          <div className={styles.timeScale} style={{height:`calc(${hourRange.length} * var(--hour-height))`}}>
            {hourRange.map(h => (
              <div key={'h'+h} className={styles.timeLabelHour} style={{ top: `calc(${h-startHour} * var(--hour-height))` }}>{formatHour(h)}</div>
            ))}
            {hourRange.map(h => (
              <div key={'m'+h} className={styles.timeLabelHalf} style={{ top: `calc((${h-startHour} + 0.5) * var(--hour-height))` }}>{formatHour(h, true)}</div>
            ))}
          </div>
        </div>
        {/* Day columns */}
        {weekDates.map((date, idx) => {
          const dateKey = date.toISOString().split("T")[0];
          const dayList = eventsByDay[dateKey] || [];
          const stripes = overlapSlices[dateKey] || [];
          const isToday = date.toDateString() === nowDate.toDateString();
          return (
            <div key={idx} className={`${styles.dayColumn} ${isToday ? styles.todayColumn : ""}`}>
              {hourRange.map(hour => (
                <div key={hour} className={styles.hourRow} />
              ))}
              <div className={styles.eventsLayer}>
                {stripes.map((s,i)=>{
                  const eventA = eventsByDay[dateKey][s.aIndex];
                  const eventB = eventsByDay[dateKey][s.bIndex];
                  const colorA = eventA.__baseColor || '#3aa7e7';
                  const colorB = eventB.__baseColor || '#2ecc71';
                  return (
                    <div key={i} className={styles.overlapStripe + ' ' + (s.topRounded ? styles.ovTopRound : '') + ' ' + (s.bottomRounded ? styles.ovBottomRound : '')} style={{
                      top: `calc(${s.startMinutes} * (var(--hour-height)/60))`,
                      height: `calc(${s.durationMinutes} * (var(--hour-height)/60))`,
                      background: `repeating-linear-gradient(135deg, ${colorA} 0 16px, ${colorB} 16px 32px)`
                    }}>
                      <div className={styles.overlapStripeLabel}>{s.label}</div>
                    </div>
                  )
                })}
                {dayList.map((ev, i) => {
                  const startDate = new Date(ev.start);
                  const endDate = ev.end ? new Date(ev.end) : new Date(startDate.getTime() + 30*60000);
                  const isOngoing =
                    nowTick >= startDate.getTime() && nowTick < endDate.getTime();
                  const whitelisted = ev.uid && config?.whitelist.includes(ev.uid);
                  const baseColor = ev.__baseColor || ev.color || config?.colors?.[ev.calendarUrl] || "#3aa7e7";
                  const bg =
                    ev.blocking && !whitelisted
                      ? baseColor
                      : shadeColor(baseColor, -30);
                  const backgroundStyle = `linear-gradient(160deg, ${shadeColor(bg,-6)}, ${shadeColor(bg,-22)})`;
                  const headerBg = shadeColor(baseColor, -45);
                  const small = ev.__durationMinutes < 20; // less than 20 minutes -> compressed styling
                  const hideContent = (ev as any).__fullOverlap;
                  return (
                    <div
                      key={i}
                      className={`${styles.calendarEvent} ${small ? styles.smallEvent : ""} ${isOngoing ? styles.ongoing : ""}`}
                      style={{
                        top: `calc(${ev.__startMinutes} * (var(--hour-height) / 60))`,
                        height: `calc(${ev.__durationMinutes} * (var(--hour-height) / 60))`,
                        left: 0,
                        width: '100%',
                        background: backgroundStyle,
                        borderLeftColor: shadeColor(bg, 15),
                      }}
                      title={`${ev.summary}\n${startDate.toLocaleTimeString()} - ${endDate.toLocaleTimeString()}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDay(date.getDate());
                        loadDay(date);
                      }}
                    >
                      {!hideContent && (
                        <div className={styles.eventContent}>
                          <div className={styles.eventHeader} style={{ background: headerBg }}>
                            <div className={styles.eventTitle} title={ev.summary}>{ev.summary}</div>
                            <div className={styles.eventTime}>
                              {startDate.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
                              {" – "}
                              {endDate.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
                            </div>
                          </div>
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

      {/* Modal */}
      {selectedDay && selectedDayEvents && (
        <DayEventsModal
          day={selectedDay}
          month={weekStart.getMonth() + 1}
          year={weekStart.getFullYear()}
          events={selectedDayEvents}
          config={config}
          onClose={() => {
            setSelectedDay(null);
            setSelectedDayEvents(null);
            onConfigRefresh && onConfigRefresh();
          }}
          onConfigUpdate={() => {
            onConfigRefresh && onConfigRefresh();
          }}
        />
      )}
    </div>
  );
};
