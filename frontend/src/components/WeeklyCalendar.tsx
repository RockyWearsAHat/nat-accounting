import React, { useState, useEffect } from "react";
import axios from "axios";
import { CalendarEvent, CalendarConfig } from "../types/calendar";
import { DayEventsModal } from "./DayEventsModal";
import "./calendar.css";

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

  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<
    CalendarEvent[] | null
  >(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // Update current time every minute
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
    if (!config || loading) return;

    setLoading(true);
    console.log(
      `[WeeklyCalendar] Loading week events for ${
        weekStart.toISOString().split("T")[0]
      }`
    );

    try {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const { data } = await axios.get("/api/icloud/week", {
        params: {
          start: weekStart.toISOString().split("T")[0],
          end: weekEnd.toISOString().split("T")[0],
        },
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
      const { data } = await axios.get("/api/icloud/day", {
        params: { date: dateStr },
      });
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

  // Process events for display
  const weekDates = getWeekDates(weekStart);
  const nowDate = new Date(nowTick);

  // Group events by day
  const eventsByDay: Record<string, CalendarEvent[]> = {};
  weekDates.forEach((date) => {
    const dateKey = date.toISOString().split("T")[0];
    eventsByDay[dateKey] = [];
  });

  events.forEach((event) => {
    const eventDate = new Date(event.start);
    const dateKey = eventDate.toISOString().split("T")[0];
    if (eventsByDay[dateKey]) {
      eventsByDay[dateKey].push(event);
    }
  });

  return (
    <div className="weekly-calendar">
      <h3 className="calendar-title">Calendar (Weekly View)</h3>

      {/* Week Navigation */}
      <div className="calendar-nav">
        <button className="nav-button" onClick={() => navigateWeek("prev")}>
          ← Prev
        </button>
        <button className="nav-button" onClick={() => navigateWeek("next")}>
          Next →
        </button>
        <div className="week-range">
          {weekStart.toLocaleDateString()} -{" "}
          {(() => {
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            return weekEnd.toLocaleDateString();
          })()}
        </div>
        <button className="nav-button" onClick={goToCurrentWeek}>
          This Week
        </button>
        <select
          value={weekStart.getMonth()}
          onChange={(e) => {
            const month = parseInt(e.target.value, 10);
            goToSpecificWeek(weekStart.getFullYear(), month + 1, 1);
          }}
          className="month-select"
        >
          {MONTH_NAMES.map((name, idx) => (
            <option key={idx} value={idx}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={weekStart.getFullYear()}
          onChange={(e) => {
            const year =
              parseInt(e.target.value, 10) || weekStart.getFullYear();
            goToSpecificWeek(year, weekStart.getMonth() + 1, 1);
          }}
          className="year-input"
        />
        <button className="nav-button" onClick={loadWeek}>
          🔄 Reload
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="calendar-loading">
          <div>📅 Loading week events...</div>
          <div className="loading-subtitle">
            Please wait while we fetch your calendar data
          </div>
        </div>
      )}

      {/* No Events State */}
      {!loading && events.length === 0 && (
        <div className="calendar-empty">
          <div>📭 No events found for this week</div>
          <div className="empty-subtitle">
            Make sure your calendars are marked as "busy" in the settings below
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      {!loading && (
        <div className="calendar-grid">
          {/* Time column header */}
          <div className="time-header">Time</div>

          {/* Day headers */}
          {weekDates.map((date, dayIndex) => {
            const isToday =
              date.getFullYear() === nowDate.getFullYear() &&
              date.getMonth() === nowDate.getMonth() &&
              date.getDate() === nowDate.getDate();

            return (
              <div
                key={dayIndex}
                className={`day-header ${isToday ? "today" : ""}`}
                onClick={() => {
                  setSelectedDay(date.getDate());
                  loadDay(date);
                }}
              >
                <div className="day-weekday">
                  {date.toLocaleDateString(undefined, { weekday: "short" })}
                </div>
                <div className="day-number">{date.getDate()}</div>
                <div className="day-month">
                  {date.toLocaleDateString(undefined, { month: "short" })}
                </div>
              </div>
            );
          })}

          {/* Time slots and events */}
          {Array.from({ length: 24 }, (_, hour) => {
            return (
              <React.Fragment key={hour}>
                {/* Time label */}
                <div className="time-slot">
                  {hour === 0
                    ? "12 AM"
                    : hour === 12
                    ? "12 PM"
                    : hour > 12
                    ? `${hour - 12} PM`
                    : `${hour} AM`}
                </div>

                {/* Day columns for this hour */}
                {weekDates.map((date, dayIndex) => {
                  const dateKey = date.toISOString().split("T")[0];
                  const dayEvents = eventsByDay[dateKey] || [];

                  // Get events that START in this hour
                  const hourEvents = dayEvents.filter((event) => {
                    const eventStart = new Date(event.start);
                    return eventStart.getHours() === hour;
                  });

                  // Apply filtering based on calendar settings
                  const filteredEvents = config
                    ? hourEvents.filter((ev) => {
                        const busySet = new Set(
                          config.calendars
                            .filter((c) => c.busy)
                            .map((c) => c.url)
                        );
                        return (
                          busySet.has(ev.calendarUrl) ||
                          (ev.uid && (config.busyEvents || []).includes(ev.uid))
                        );
                      })
                    : hourEvents;

                  const isToday =
                    date.getFullYear() === nowDate.getFullYear() &&
                    date.getMonth() === nowDate.getMonth() &&
                    date.getDate() === nowDate.getDate();

                  const isCurrentHour = isToday && nowDate.getHours() === hour;

                  return (
                    <div
                      key={`${dayIndex}-${hour}`}
                      className={`hour-cell ${
                        isCurrentHour ? "current-hour" : ""
                      }`}
                    >
                      {filteredEvents.map((event, eventIndex) => {
                        const eventStart = new Date(event.start);
                        const eventEnd = event.end
                          ? new Date(event.end)
                          : new Date(eventStart.getTime() + 30 * 60000);

                        const startMinutes = eventStart.getMinutes();
                        const durationMinutes =
                          (eventEnd.getTime() - eventStart.getTime()) /
                          (1000 * 60);

                        const topPercent = (startMinutes / 60) * 100;
                        const heightPercent = Math.max(
                          20,
                          (durationMinutes / 60) * 100
                        );

                        const whitelisted =
                          event.uid && config?.whitelist.includes(event.uid);
                        const isOngoing =
                          nowTick >= eventStart.getTime() &&
                          nowTick < eventEnd.getTime();
                        const baseColor =
                          event.color ||
                          config?.colors?.[event.calendarUrl] ||
                          "#444";
                        const color =
                          event.blocking && !whitelisted
                            ? baseColor
                            : shadeColor(baseColor, -35);

                        return (
                          <div
                            key={eventIndex}
                            className={`calendar-event ${
                              isOngoing ? "ongoing" : ""
                            }`}
                            style={{
                              top: `${topPercent}%`,
                              height: `${heightPercent}%`,
                              background: `linear-gradient(145deg, ${color}, ${shadeColor(
                                color,
                                -15
                              )})`,
                              borderLeftColor: shadeColor(color, 20),
                            }}
                            title={`${
                              event.summary
                            }\n${eventStart.toLocaleTimeString()} - ${eventEnd.toLocaleTimeString()}\nDuration: ${Math.round(
                              durationMinutes
                            )}min`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDay(date.getDate());
                              loadDay(date);
                            }}
                          >
                            <div className="event-time">
                              {eventStart.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {heightPercent > 80 && (
                                <span className="event-end-time">
                                  {" "}
                                  –{" "}
                                  {eventEnd.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              )}
                            </div>
                            <div className="event-title">{event.summary}</div>
                            {heightPercent > 60 && durationMinutes > 60 && (
                              <div className="event-duration">
                                {Math.round(durationMinutes)}min
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Current time indicator */}
                      {isCurrentHour && (
                        <div
                          className="current-time-indicator"
                          style={{
                            top: `${(nowDate.getMinutes() / 60) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Day Events Modal */}
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
