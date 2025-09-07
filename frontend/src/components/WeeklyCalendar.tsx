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
  function formatHour(h:number){
    if(h===0) return '12 AM';
    if(h===12) return '12 PM';
    if(h>12) return `${h-12} PM`;
    return `${h} AM`;
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
  let startHour = 0;
  let endHour = 24;
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

  const eventsByDay: Record<
    string,
    (CalendarEvent & { __top: number; __height: number; __lane: number; __baseColor?: string })[]
  > = {};
  const overlapSlices: Record<string, { top:number; height:number; colors:[string,string] }[]> = {};
  weekDates.forEach((d) => {
    eventsByDay[d.toISOString().split("T")[0]] = [];
  });

  // Pre-filter events by config (after fetch) respecting busy calendars & forced busy events
  const busySet = new Set(
    (config?.calendars || []).filter((c) => c.busy).map((c) => c.url)
  );
  const forcedBusy = new Set(config?.busyEvents || []);
  const relevantEvents = events.filter((ev) => {
    if (!config) return true; // show until config loaded
    return busySet.has(ev.calendarUrl) || (ev.uid && forcedBusy.has(ev.uid));
  });

  for (const ev of relevantEvents) {
    const start = new Date(ev.start);
    const end = ev.end
      ? new Date(ev.end)
      : new Date(start.getTime() + 30 * 60000);
    const dateKey = start.toISOString().split("T")[0];
    if (!(dateKey in eventsByDay)) continue;
    const startMinutesFromDay = start.getHours() * 60 + start.getMinutes();
    const endMinutesFromDay = end.getHours() * 60 + end.getMinutes();
    const windowStartMinutes = startHour * 60;
    const windowEndMinutes = endHour * 60;
    const clampedStart = Math.max(startMinutesFromDay, windowStartMinutes);
    const clampedEnd = Math.min(endMinutesFromDay, windowEndMinutes);
    if (clampedEnd <= windowStartMinutes || clampedStart >= windowEndMinutes)
      continue;
    const relativeStart = clampedStart - windowStartMinutes;
  const relativeDuration = Math.max(20, clampedEnd - clampedStart); // ensure readable block
    // pre-compute base color similar to render logic for overlap striping
    const calendarColor = config?.colors?.[ev.calendarUrl];
    const baseColor = ev.color || calendarColor || "#3aa7e7";
    (eventsByDay[dateKey] as any).push({
      ...ev,
      __top: relativeStart / daySpanMinutes,
      __height: relativeDuration / daySpanMinutes,
      __lane: 0,
      __baseColor: baseColor
    });
  }

  // Build overlap slices (only overlapping vertical segments, striped with both colors)
  Object.keys(eventsByDay).forEach(key => {
    const list = eventsByDay[key];
  list.sort((a,b)=> new Date(a.start).getTime() - new Date(b.start).getTime());
    overlapSlices[key] = [];
    for (let i=0;i<list.length;i++){
      const a = list[i];
      const aStart = new Date(a.start).getTime();
      const aEnd = new Date(a.end || a.start).getTime();
      for (let j=i+1;j<list.length;j++){
        const b = list[j];
        const bStart = new Date(b.start).getTime();
  if (bStart > aEnd) break; // allow touching endpoints to still break loop
        const bEnd = new Date(b.end || b.start).getTime();
  // treat slight adjacency (<=2 minutes gap) as overlap for stripe visibility
  if (bStart < aEnd + 2*60000){
          const overlapStart = Math.max(aStart,bStart);
          const overlapEnd = Math.min(aEnd,bEnd);
          if (overlapEnd > overlapStart){
            const ovStartDate = new Date(overlapStart);
            const ovEndDate = new Date(overlapEnd);
            const startMinutesFromDay = ovStartDate.getHours()*60 + ovStartDate.getMinutes();
            const endMinutesFromDay = ovEndDate.getHours()*60 + ovEndDate.getMinutes();
            const windowStartMinutes = startHour*60;
            const windowEndMinutes = endHour*60;
            const cStart = Math.max(startMinutesFromDay, windowStartMinutes);
            const cEnd = Math.min(endMinutesFromDay, windowEndMinutes);
            if (cEnd > cStart){
              const relTop = (cStart - windowStartMinutes) / daySpanMinutes;
              const relHeight = (cEnd - cStart) / daySpanMinutes;
              overlapSlices[key].push({
                top: relTop,
                height: relHeight,
                colors: [a.__baseColor || '#3aa7e7', b.__baseColor || '#2ecc71']
              });
            }
          }
        }
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
      <div className={styles.dayHeaderRow}>
        <div className={styles.timeHeader}>Time</div>
        {weekDates.map((date, idx) => {
          const isToday = date.toDateString() === nowDate.toDateString();
          return (
            <div
              key={idx}
              className={`${styles.dayHeader} ${isToday ? styles.today : ""}`}
              onClick={() => {
                setSelectedDay(date.getDate());
                loadDay(date);
              }}
            >
              <div className={styles.dayWeekday}>
                {date.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div className={styles.dayNumber}>{date.getDate()}</div>
              <div className={styles.dayMonth}>
                {date.toLocaleDateString(undefined, { month: "short" })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Body */}
  <div className={styles.calendarBody} style={{ minHeight: `calc(var(--hour-height) * ${Math.max(hourRange.length,10)})` }}>
        {/* Time column with hour + half-hour labels */}
        <div className={styles.timeCol}>
          <div className={styles.timeScale} style={{height:`100%`}}>
            {hourRange.map(h => {
              const pctBase = ((h-startHour)*60) / daySpanMinutes * 100;
              return <div key={'h'+h} className={styles.timeLabelHour} style={{top: `${pctBase}%`}}>{formatHour(h)}</div>;
            })}
            {hourRange.map(h => {
              const pctHalf = (((h-startHour)*60)+30) / daySpanMinutes * 100;
              return <div key={'m'+h} className={styles.timeLabelHalf} style={{top: `${pctHalf}%`}}>{`${(h%12===0?12: (h%12))}:30`}</div>;
            })}
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
              {hourRange.map((h) => (
                <div key={h} className={styles.hourRow} />
              ))}
              <div className={styles.eventsLayer}>
                {stripes.map((s,i)=>(
                  <div key={i} className={styles.overlapStripe} style={{
                    top: `${(s.top*100).toFixed(4)}%`,
                    height: `${(s.height*100).toFixed(4)}%`,
                    background: `repeating-linear-gradient(135deg, ${s.colors[0]} 0 12px, ${s.colors[1]} 12px 24px)`
                  }} />
                ))}
                {dayList.map((ev, i) => {
                  const startDate = new Date(ev.start);
                  const endDate = ev.end
                    ? new Date(ev.end)
                    : new Date(startDate.getTime() + 30 * 60000);
                  const isOngoing =
                    nowTick >= startDate.getTime() && nowTick < endDate.getTime();
                  const whitelisted = ev.uid && config?.whitelist.includes(ev.uid);
                  const baseColor = ev.__baseColor || ev.color || config?.colors?.[ev.calendarUrl] || "#3aa7e7";
                  const bg =
                    ev.blocking && !whitelisted
                      ? baseColor
                      : shadeColor(baseColor, -30);
                  // base gradient only (stripes rendered separately for exact overlap slice)
                  const backgroundStyle = `linear-gradient(145deg, ${bg}, ${shadeColor(bg,-18)})`;
                  return (
                    <div
                      key={i}
                      className={`${styles.calendarEvent} ${isOngoing ? styles.ongoing : ""}`}
                      style={{
                        top: `${(ev.__top * 100).toFixed(4)}%`,
                        height: `${(ev.__height * 100).toFixed(4)}%`,
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
                      <div className={styles.eventContent}>
                        <div className={styles.eventTime}>
                          {startDate.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
                          {" – "}
                          {endDate.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
                        </div>
                        <div className={styles.eventTitle} title={ev.summary}>{ev.summary}</div>
                      </div>
                    </div>
                  );
                })}
                {isToday && (
                  <div
                    className={styles.currentTimeIndicator}
                    style={{
                      top: `${
                        ((nowDate.getHours() * 60 + nowDate.getMinutes()) -
                          startHour * 60) /
                        daySpanMinutes *
                        100
                      }%`,
                    }}
                  />
                )}
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
