import React, { useState, useEffect } from "react";
import axios from "axios";
import { CalendarEvent, CalendarConfig } from "../types/calendar";

interface DayEventsModalProps {
  day: number;
  month: number;
  year: number;
  events: CalendarEvent[];
  config: CalendarConfig | null;
  onClose: () => void;
  onConfigUpdate: () => void;
}

export const DayEventsModal: React.FC<DayEventsModalProps> = ({
  day,
  month,
  year,
  events,
  config,
  onClose,
  onConfigUpdate,
}) => {
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const toggleWhitelist = async (uid: string) => {
    try {
      const isWhitelisted = config?.whitelist.includes(uid);
      await axios.post("/api/icloud/whitelist", {
        uid,
        action: isWhitelisted ? "remove" : "add",
      });
      onConfigUpdate();
    } catch (error) {
      console.error("Failed to toggle whitelist:", error);
    }
  };

  const toggleBusyEvent = async (uid: string) => {
    try {
      const isBusy = config?.busyEvents?.includes(uid);
      await axios.post("/api/icloud/event-busy", {
        uid,
        action: isBusy ? "remove" : "add",
      });
      onConfigUpdate();
    } catch (error) {
      console.error("Failed to toggle busy event:", error);
    }
  };

  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(
    day
  ).padStart(2, "0")}`;
  const busyCalendarSet = new Set(
    config?.calendars.filter((c) => c.busy).map((c) => c.url) || []
  );
  const forcedBusySet = new Set(config?.busyEvents || []);

  const visibleEvents = events.filter((e) => {
    if (e.uid && forcedBusySet.has(e.uid)) return true;
    if (busyCalendarSet.has(e.calendarUrl)) return true;
    return false;
  });

  const hiddenEvents = events.filter((e) => !visibleEvents.includes(e));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="day-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Events on {dateStr}</h3>
          <button onClick={onClose} className="close-btn">
            ×
          </button>
        </div>

        <div className="modal-content">
          {events.length === 0 ? (
            <div className="no-events">No events scheduled</div>
          ) : (
            <div className="events-layout">
              {/* Event List */}
              <div className="events-list">
                <h4>Event List</h4>
                {events.map((event, index) => {
                  const eventStart = new Date(event.start);
                  const eventEnd = event.end ? new Date(event.end) : null;
                  const isOngoing =
                    Date.now() >= eventStart.getTime() &&
                    Date.now() < (eventEnd?.getTime() || 0);
                  const isVisible = visibleEvents.includes(event);
                  const isWhitelisted =
                    event.uid && config?.whitelist.includes(event.uid);
                  const isForcedBusy =
                    event.uid && config?.busyEvents?.includes(event.uid);

                  return (
                    <div
                      key={index}
                      className={`event-item ${isOngoing ? "ongoing" : ""} ${
                        !isVisible ? "hidden" : ""
                      }`}
                    >
                      <div className="event-time">
                        {eventStart.toLocaleTimeString()} -{" "}
                        {eventEnd?.toLocaleTimeString() || ""}
                      </div>
                      <div className="event-title">{event.summary}</div>
                      <div className="event-calendar">{event.calendar}</div>

                      {event.uid && (
                        <div className="event-actions">
                          <button
                            onClick={() => toggleWhitelist(event.uid!)}
                            className={`action-btn ${
                              isWhitelisted ? "active" : ""
                            }`}
                          >
                            {isWhitelisted ? "Unwhitelist" : "Whitelist"}
                          </button>
                          <button
                            onClick={() => toggleBusyEvent(event.uid!)}
                            className={`action-btn ${
                              isForcedBusy ? "active" : ""
                            }`}
                          >
                            {isForcedBusy ? "Unforce Busy" : "Force Busy"}
                          </button>
                        </div>
                      )}

                      <div
                        className={`event-status ${
                          isOngoing
                            ? "ongoing"
                            : event.blocking
                            ? "blocking"
                            : "free"
                        }`}
                      >
                        {isOngoing
                          ? "Ongoing"
                          : event.blocking
                          ? "Blocking"
                          : "Free"}
                      </div>
                    </div>
                  );
                })}

                {hiddenEvents.length > 0 && (
                  <div className="hidden-events-note">
                    {hiddenEvents.length} event(s) from non-busy calendars are
                    hidden from timeline
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="events-timeline">
                <h4>Timeline</h4>
                <div className="timeline-container">
                  {visibleEvents.map((event, index) => {
                    const eventStart = new Date(event.start);
                    const eventEnd = event.end
                      ? new Date(event.end)
                      : new Date(eventStart.getTime() + 30 * 60000);
                    const isOngoing =
                      Date.now() >= eventStart.getTime() &&
                      Date.now() < eventEnd.getTime();

                    const startHour = eventStart.getHours();
                    const endHour = eventEnd.getHours();
                    const startMinutes = eventStart.getMinutes();
                    const endMinutes = eventEnd.getMinutes();

                    const topPercent =
                      ((startHour * 60 + startMinutes) / (24 * 60)) * 100;
                    const heightPercent =
                      ((endHour * 60 +
                        endMinutes -
                        (startHour * 60 + startMinutes)) /
                        (24 * 60)) *
                      100;

                    return (
                      <div
                        key={index}
                        className={`timeline-event ${
                          isOngoing ? "ongoing" : ""
                        }`}
                        style={{
                          top: `${topPercent}%`,
                          height: `${Math.max(heightPercent, 2)}%`,
                          backgroundColor:
                            event.color ||
                            config?.colors?.[event.calendarUrl] ||
                            "#4a90e2",
                        }}
                        title={`${
                          event.summary
                        }\n${eventStart.toLocaleTimeString()} - ${eventEnd.toLocaleTimeString()}`}
                      >
                        <div className="timeline-event-title">
                          {event.summary}
                        </div>
                        <div className="timeline-event-time">
                          {eventStart.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          -{" "}
                          {eventEnd.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Current time indicator */}
                  {(() => {
                    const now = new Date();
                    if (
                      now.getFullYear() === year &&
                      now.getMonth() + 1 === month &&
                      now.getDate() === day
                    ) {
                      const nowPercent =
                        ((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) *
                        100;
                      return (
                        <div
                          className="timeline-current-time"
                          style={{ top: `${nowPercent}%` }}
                        />
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
