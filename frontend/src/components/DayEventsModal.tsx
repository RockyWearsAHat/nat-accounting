import React, { useState, useEffect } from "react";
import styles from "./calendar.module.css";
import { http } from "../lib/http";
import { CalendarEvent, CalendarConfig } from "../types/calendar";

interface DayEventsModalProps {
  day: number;
  month: number;
  year: number;
  events: CalendarEvent[];
  config: CalendarConfig | null;
  onClose: () => void;
  onConfigUpdate: () => void;
  footer?: React.ReactNode;
}
// (removed stray destructuring block)
export function DayEventsModal(props: DayEventsModalProps) {
  const { day, month, year, events, config, onClose, onConfigUpdate, footer } = props;
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const toggleWhitelist = async (uid: string) => {
    try {
      const isWhitelisted = config?.whitelist.includes(uid);
  await http.post("/api/icloud/whitelist", {
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
  await http.post("/api/icloud/event-busy", {
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
  const [deletingUid, setDeletingUid] = useState<string|null>(null);
  const handleDelete = async (uid: string) => {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    setDeletingUid(uid);
    try {
      await http.post('/api/icloud/delete-event', { uid });
      onConfigUpdate();
      setDeletingUid(null);
    } catch (e) {
      alert('Failed to delete event.');
      setDeletingUid(null);
    }
  };
  return (
    <div className={styles['modal-overlay']} onClick={onClose}>
      <div className={styles['day-modal']} onClick={e => e.stopPropagation()}>
        <div className={styles['modal-header']}>
          <h3>Day View: {dateStr}</h3>
          <button onClick={onClose} className={styles['close-btn']}>
            ×
          </button>
        </div>
        <div className={styles['modal-content']}>
          {/* Mini calendar timeline for the day */}
          <div style={{ width: '100%', minHeight: 320, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Events Timeline</div>
            <div style={{ position: 'relative', height: 320, background: '#121216', borderRadius: 10, border: '1px solid #23232a', overflow: 'hidden', marginBottom: 16 }}>
              {/* Hour grid */}
              {[...Array(12)].map((_, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: `${(i * 100) / 12}%`,
                  height: 1,
                  background: 'rgba(255,255,255,0.07)',
                  zIndex: 1
                }} />
              ))}
              {/* Events */}
              {visibleEvents.map((event, idx) => {
                const eventStart = new Date(event.start);
                const eventEnd = event.end ? new Date(event.end) : new Date(eventStart.getTime() + 30 * 60000);
                const startMinutes = eventStart.getHours() * 60 + eventStart.getMinutes();
                const endMinutes = eventEnd.getHours() * 60 + eventEnd.getMinutes();
                const top = (startMinutes / (24 * 60)) * 100;
                const height = Math.max(((endMinutes - startMinutes) / (24 * 60)) * 100, 3);
                return (
                  <div key={idx} style={{
                    position: 'absolute',
                    left: 12,
                    right: 12,
                    top: `${top}%`,
                    height: `${height}%`,
                    background: event.color || config?.colors?.[event.calendarUrl] || '#4a90e2',
                    borderRadius: 8,
                    color: '#fff',
                    padding: '6px 10px',
                    fontWeight: 500,
                    fontSize: 13,
                    boxShadow: '0 2px 8px #000a',
                    zIndex: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}>
                    <div>{event.summary}</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>{eventStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {eventEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
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
                  const nowMinutes = now.getHours() * 60 + now.getMinutes();
                  const nowTop = (nowMinutes / (24 * 60)) * 100;
                  return (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: `${nowTop}%`,
                      height: 2,
                      background: 'linear-gradient(90deg, #ff4e4e 60%, #ffb84e 100%)',
                      zIndex: 3,
                      borderRadius: 2,
                    }} />
                  );
                }
                return null;
              })()}
            </div>
            {/* List of events */}
            <div style={{ width: '100%' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Event List</div>
              {events.length === 0 ? (
                <div style={{ color: '#aaa', fontStyle: 'italic' }}>No events scheduled</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {events.map((event, index) => {
                    const eventStart = new Date(event.start);
                    const eventEnd = event.end ? new Date(event.end) : null;
                    const isOngoing = Date.now() >= eventStart.getTime() && Date.now() < (eventEnd?.getTime() || 0);
                    const isVisible = visibleEvents.includes(event);
                    const isWhitelisted = event.uid && config?.whitelist.includes(event.uid);
                    const isForcedBusy = event.uid && config?.busyEvents?.includes(event.uid);
                    return (
                      <div key={index} style={{
                        background: isVisible ? '#23232a' : '#18181c',
                        borderRadius: 8,
                        padding: '8px 12px',
                        color: isVisible ? '#fff' : '#888',
                        opacity: isVisible ? 1 : 0.6,
                        border: isOngoing ? '1.5px solid #4e8cff' : '1px solid #23232a',
                        boxShadow: isOngoing ? '0 2px 8px #4e8cff44' : undefined,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}>
                        <div style={{ fontWeight: 600 }}>{event.summary}</div>
                        <div style={{ fontSize: 13 }}>{eventStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {eventEnd?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || ''}</div>
                        <div style={{ fontSize: 12, color: '#b0b0c3' }}>{event.calendar}</div>
                        {event.uid && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <button onClick={() => toggleWhitelist(event.uid!)} style={{ background: isWhitelisted ? '#4e8cff' : '#23232a', color: '#fff', border: 'none', borderRadius: 5, padding: '2px 10px', fontSize: 12, cursor: 'pointer' }}>{isWhitelisted ? 'Unwhitelist' : 'Whitelist'}</button>
                            <button onClick={() => toggleBusyEvent(event.uid!)} style={{ background: isForcedBusy ? '#ffb84e' : '#23232a', color: '#fff', border: 'none', borderRadius: 5, padding: '2px 10px', fontSize: 12, cursor: 'pointer' }}>{isForcedBusy ? 'Unforce Busy' : 'Force Busy'}</button>
                            <button onClick={() => handleDelete(event.uid!)} style={{ background: '#ff4e4e', color: '#fff', border: 'none', borderRadius: 5, padding: '2px 10px', fontSize: 12, cursor: 'pointer' }} disabled={deletingUid === event.uid}>{deletingUid === event.uid ? 'Deleting...' : 'Delete'}</button>
                          </div>
                        )}
                        <div style={{ fontSize: 12, marginTop: 2, color: isOngoing ? '#4e8cff' : event.blocking ? '#ffb84e' : '#aaa' }}>
                          {isOngoing ? 'Ongoing' : event.blocking ? 'Blocking' : 'Free'}
                        </div>
                      </div>
                    );
                  })}
                  {hiddenEvents.length > 0 && (
                    <div style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>{hiddenEvents.length} event(s) from non-busy calendars are hidden from timeline</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </div>
  );
}
