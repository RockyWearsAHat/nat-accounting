import React, { useState, useEffect } from "react";
import styles from "./calendar.module.css";
import { ScheduleAppointmentModal } from "./ScheduleAppointmentModal";
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
  // Timeline config
  const timelineStart = 8; // 8 AM
  const timelineEnd = 20; // 8 PM
  const timelineHours = timelineEnd - timelineStart;
  const timelineHeight = 520; // px (wider for less squish)
  const hourHeight = timelineHeight / timelineHours;

  // Modal state for scheduling
  const [showSchedule, setShowSchedule] = useState(false);

  return (
    <div className={styles['modal-overlay']} onClick={onClose}>
      <div className={styles['day-modal']} style={{ minWidth: 900, maxWidth: 1100 }} onClick={e => e.stopPropagation()}>
        <div className={styles['modal-header']} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.01em', margin: 0 }}>Day View: {dateStr}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              style={{ background: 'linear-gradient(90deg,#4e8cff,#3aa7e7)', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 15, cursor: 'pointer', boxShadow: '0 2px 8px #0004' }}
              onClick={() => setShowSchedule(true)}
            >
              + Schedule appointment
            </button>
            <button onClick={onClose} className={styles['close-btn']} style={{ fontSize: 28, marginLeft: 8, background: 'none', color: '#fff' }}>×</button>
          </div>
        </div>
        <div className={styles['modal-content']} style={{ display: 'flex', flexDirection: 'row', gap: 32, minHeight: timelineHeight, height: timelineHeight }}>
          {/* Left: Event List */}
          <div style={{ flex: 1, minWidth: 300, maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6, letterSpacing: '-.01em' }}>Event List</div>
            {events.length === 0 ? (
              <div style={{ color: '#aaa', fontStyle: 'italic', fontSize: 15 }}>No events scheduled</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {events.map((event, index) => {
                  const eventStart = new Date(event.start);
                  const eventEnd = event.end ? new Date(event.end) : null;
                  const isOngoing = Date.now() >= eventStart.getTime() && Date.now() < (eventEnd?.getTime() || 0);
                  const isVisible = visibleEvents.includes(event);
                  const isWhitelisted = event.uid && config?.whitelist.includes(event.uid);
                  const isForcedBusy = event.uid && config?.busyEvents?.includes(event.uid);
                  // Determine if event is considered busy (blocking or forced busy)
                  const isBusy = event.blocking || isForcedBusy;
                  return (
                    <div key={index} style={{
                      background: isVisible ? '#18181c' : '#131318',
                      borderRadius: 12,
                      padding: '14px 16px',
                      color: isVisible ? '#fff' : '#888',
                      opacity: isVisible ? 1 : 0.6,
                      border: isOngoing ? '1.5px solid #4e8cff' : '1px solid #23232a',
                      boxShadow: isOngoing ? '0 2px 8px #4e8cff44' : '0 1px 4px #0002',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{event.summary}</div>
                      <div style={{ fontSize: 14 }}>{eventStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {eventEnd?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || ''}</div>
                      <div style={{ fontSize: 13, color: '#b0b0c3' }}>{event.calendar}</div>
                      {event.uid && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          <button
                            onClick={() => toggleBusyEvent(event.uid!)}
                            style={{
                              background: isBusy ? '#ffb84e' : '#23232a',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 6,
                              padding: '3px 12px',
                              fontSize: 13,
                              cursor: 'pointer',
                              fontWeight: 500
                            }}
                          >
                            {isBusy ? 'Mark as "Not Busy"' : 'Mark as "Busy"'}
                          </button>
                          <button onClick={() => handleDelete(event.uid!)} style={{ background: '#ff4e4e', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }} disabled={deletingUid === event.uid}>{deletingUid === event.uid ? 'Deleting...' : 'Delete'}</button>
                        </div>
                      )}
                      <div style={{ fontSize: 13, marginTop: 2, color: isOngoing ? '#4e8cff' : event.blocking ? '#ffb84e' : '#aaa', fontWeight: 500 }}>
                        {isOngoing ? 'Ongoing' : event.blocking ? 'Blocking' : 'Free'}
                      </div>
                    </div>
                  );
                })}
                {hiddenEvents.length > 0 && (
                  <div style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>{hiddenEvents.length} event(s) from non-busy calendars are hidden from timeline</div>
                )}
              </div>
            )}
          </div>
          {/* Right: Timeline */}
          <div style={{ flex: 2, minWidth: 420, display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8, letterSpacing: '-.01em' }}>Events Timeline</div>
            <div style={{ position: 'relative', height: timelineHeight, background: '#121216', borderRadius: 14, border: '1px solid #23232a', overflow: 'hidden', marginBottom: 0, boxShadow: '0 2px 12px #0002' }}>
              {/* Time labels */}
              {[...Array(timelineHours + 1)].map((_, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  left: 0,
                  width: 48,
                  top: i * hourHeight - 10,
                  height: 20,
                  color: '#b0b0c3',
                  fontSize: 13,
                  textAlign: 'right',
                  zIndex: 2,
                  paddingRight: 8,
                  fontWeight: 500,
                  opacity: 0.85,
                  pointerEvents: 'none',
                }}>{`${(timelineStart + i) % 24}:00`}</div>
              ))}
              {/* Hour grid lines */}
              {[...Array(timelineHours)].map((_, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  left: 48,
                  right: 0,
                  top: i * hourHeight,
                  height: 1,
                  background: 'rgba(255,255,255,0.07)',
                  zIndex: 1
                }} />
              ))}
              {/* Events */}
              {visibleEvents.map((event, idx) => {
                const eventStart = new Date(event.start);
                const eventEnd = event.end ? new Date(event.end) : new Date(eventStart.getTime() + 30 * 60000);
                // Clamp to timeline
                const startHour = Math.max(eventStart.getHours() + eventStart.getMinutes() / 60, timelineStart);
                const endHour = Math.min(eventEnd.getHours() + eventEnd.getMinutes() / 60, timelineEnd);
                if (endHour <= timelineStart || startHour >= timelineEnd) return null;
                const top = ((startHour - timelineStart) / timelineHours) * timelineHeight;
                const height = Math.max(((endHour - startHour) / timelineHours) * timelineHeight, 18);
                return (
                  <div key={idx} style={{
                    position: 'absolute',
                    left: 60,
                    right: 18,
                    top,
                    height,
                    background: event.color || config?.colors?.[event.calendarUrl] || '#4a90e2',
                    borderRadius: 8,
                    color: '#fff',
                    padding: '7px 14px 7px 12px',
                    fontWeight: 600,
                    fontSize: 14,
                    boxShadow: '0 2px 8px #000a',
                    zIndex: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    border: '1.5px solid #23232a',
                    overflow: 'hidden',
                  }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.summary}</div>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>{eventStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {eventEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                );
              })}
              {/* Current time indicator */}
              {(() => {
                const now = new Date();
                if (
                  now.getFullYear() === year &&
                  now.getMonth() + 1 === month &&
                  now.getDate() === day &&
                  now.getHours() >= timelineStart &&
                  now.getHours() < timelineEnd
                ) {
                  const nowHour = now.getHours() + now.getMinutes() / 60;
                  const nowTop = ((nowHour - timelineStart) / timelineHours) * timelineHeight;
                  return (
                    <div style={{
                      position: 'absolute',
                      left: 48,
                      right: 0,
                      top: nowTop - 1,
                      height: 2,
                      background: 'linear-gradient(90deg, #ff4e4e 60%, #ffb84e 100%)',
                      zIndex: 10,
                      borderRadius: 2,
                    }} />
                  );
                }
                return null;
              })()}
            </div>
          </div>
        </div>
        {/* Scheduling Modal */}
        {showSchedule && (
          <div className={styles['modal-overlay']} style={{ zIndex: 10001 }}>
            <div className={styles['day-modal']} style={{ minWidth: 700, maxWidth: 900, position: 'relative' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <button onClick={() => setShowSchedule(false)} className={styles['close-btn']} style={{ fontSize: 18, background: 'none', color: '#fff', marginRight: 8 }}>&larr; Back</button>
                <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Schedule Appointment</h3>
                <span style={{ width: 40 }} />
              </div>
              {/* Reuse ScheduleAppointmentModal, but hide its overlay and close button */}
              <div style={{ marginTop: 0 }}>
                <ScheduleAppointmentModal
                  open={true}
                  onClose={() => setShowSchedule(false)}
                  onScheduled={() => {
                    setShowSchedule(false);
                    onConfigUpdate();
                  }}
                  defaultDate={dateStr}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
