import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./calendar.module.css";
import { ScheduleAppointmentModal } from "./ScheduleAppointmentModal";
import { EventModal } from "./EventModal";
import { http } from "../lib/http";
import { CalendarEvent, CalendarConfig } from "../types/calendar";

// Date parsing helper for timezone-corrected events
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
  } catch (error) {
    console.warn('Failed to parse date:', dateISO, error);
    return { year: '2023', month: '01', day: '01', hour: 0, minute: 0 };
  }
}

// Helper functions from WeeklyCalendar
function dayKeyFromISO(dateString: string): string {
  return dateString.split('T')[0];
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function shadeColor(color: string, amount: number): string {
  // Simple color shading function
  const usePound = color[0] === '#';
  const col = usePound ? color.slice(1) : color;
  const num = parseInt(col, 16);
  let r = (num >> 16) + amount;
  let g = (num >> 8 & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;
  r = r > 255 ? 255 : r < 0 ? 0 : r;
  g = g > 255 ? 255 : g < 0 ? 0 : g;
  b = b > 255 ? 255 : b < 0 ? 0 : b;
  return (usePound ? '#' : '') + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

interface DayEventsModalProps {
  day: number;
  month: number;
  year: number;
  events: CalendarEvent[];
  config: CalendarConfig | null;
  hours?: {
    [day: string]: { raw: string; startMinutes: number; endMinutes: number };
  } | null;
  onClose: () => void;
  onConfigUpdate: () => void;
  onNavigateDay?: (direction: 'prev' | 'next') => void;
  footer?: React.ReactNode;
}
// (removed stray destructuring block)
export function DayEventsModal(props: DayEventsModalProps) {
  const { day, month, year, events, config, hours, onClose, onConfigUpdate, onNavigateDay, footer } = props;
  const [nowTick, setNowTick] = useState(Date.now());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [hoveredEventIndex, setHoveredEventIndex] = useState<number | null>(null);
  const [hoveredEventGroup, setHoveredEventGroup] = useState<string | null>(null);
  const [hoverType, setHoverType] = useState<string | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Helper functions matching WeeklyCalendar
  const dayKeyFromISO = (dateStr: string) => dateStr;
  
  const formatHour = (h: number) =>
    h === 0 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`;
  
  const shadeColor = (color: string, percent: number) => {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, Math.max(0, (num >> 16) + amt));
    const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
    const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
    return `#${(0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
  };

  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dayDate = new Date(year, month - 1, day);
  const dayOfWeek = dayDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const dayHours = hours?.[dayOfWeek];
  const isToday = dayDate.toDateString() === new Date().toDateString();

  // Use the same hour range logic as WeeklyCalendar - extend to 7am-9pm
  const startHour = 7;
  const endHour = 21; // 9pm
  const hourRange = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  // Process events the same way as WeeklyCalendar
  const configuredCalendars = new Set(config?.calendars.map(c => c.url) || []);
  const busySet = new Set(config?.calendars.filter(c => c.busy).map(c => c.url) || []);
  const forcedBusySet = new Set(config?.busyEvents || []);

  const relevantEvents = events.filter((ev) => {
    if (!config) return true;
    if (ev.responseStatus === 'declined' || ev.status === 'declined') return false;
    
    // Only show events from calendars that are marked as busy/blocking OR forced busy events
    const calendarConfig = config.calendars.find(c => c.url === ev.calendarUrl);
    const isCalendarBusy = calendarConfig?.busy === true;
    const isForcedBusy = ev.uid && forcedBusySet.has(ev.uid);
    
    return isCalendarBusy || isForcedBusy;
  });

  // Separate all-day and timed events (fix: use generic filter since allDay may not exist)
  const allDayEvents = relevantEvents.filter(ev => !ev.start.includes('T'));
  const timedEvents = relevantEvents.filter(ev => ev.start.includes('T'));

  // Process timed events with the same logic as WeeklyCalendar
  const windowStartMinutes = startHour * 60;
  const daySpanMinutes = (endHour - startHour + 1) * 60;

  const processedEvents: (CalendarEvent & { 
    __top: number; 
    __height: number; 
    __lane: number; 
    __baseColor?: string; 
    __startMinutes: number; 
    __durationMinutes: number 
  })[] = [];

  timedEvents.forEach(ev => {
    const startParts = getDateParts(ev.start);
    const endParts = ev.end ? getDateParts(ev.end) : null;
    
    const eventStartMinutes = startParts.hour * 60 + startParts.minute;
    const eventEndMinutes = endParts ? (endParts.hour * 60 + endParts.minute) : (eventStartMinutes + 30);
    
    const clampedStart = Math.max(eventStartMinutes, windowStartMinutes);
    const clampedEnd = Math.min(eventEndMinutes, windowStartMinutes + daySpanMinutes);
    
    if (clampedEnd <= clampedStart) return;
    
    const relativeStart = clampedStart - windowStartMinutes;
    const relativeDuration = clampedEnd - clampedStart;
    
    const userOverrideColor = config?.colors?.[ev.calendarUrl];
    const baseColor = userOverrideColor || ev.color || '#3aa7e7';
    
    processedEvents.push({
      ...ev,
      __top: relativeStart / daySpanMinutes,
      __height: relativeDuration / daySpanMinutes,
      __lane: 0,
      __baseColor: baseColor,
      __startMinutes: relativeStart,
      __durationMinutes: relativeDuration
    });
  });

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

  // Navigation functions
  const navigateToDay = (direction: 'prev' | 'next') => {
    if (onNavigateDay) {
      onNavigateDay(direction);
    } else {
      // Fallback: just log the intended navigation
      const currentDate = new Date(year, month - 1, day);
      const newDate = new Date(currentDate);
      newDate.setDate(currentDate.getDate() + (direction === 'next' ? 1 : -1));
      console.log(`Navigate to ${direction}: ${newDate.toISOString().split('T')[0]}`);
    }
  };

  // Format the day header nicely
  const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'long' });
  const monthName = dayDate.toLocaleDateString('en-US', { month: 'long' });
  const dayTitle = `${dayName}, ${monthName} ${day}${isToday ? ' (Today)' : ''}`;

  return createPortal(
    <>
      {/* Only show day modal when schedule modal is not open */}
      {!showSchedule && (
        <div className={styles['modal-overlay']} onClick={onClose}>
          <div className={styles['day-modal']} style={{ minWidth: 1200, maxWidth: 1400, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className={styles['modal-header']} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24, padding: '0 4px' }}>
          {/* Left: Navigation and Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => navigateToDay('prev')}
                style={{ 
                  background: '#23232a', 
                  border: '1px solid #3a3a42', 
                  color: '#fff', 
                  borderRadius: 6, 
                  padding: '8px 12px', 
                  fontSize: 16, 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  fontWeight: 500
                }}
              >
                ←
              </button>
              <button
                onClick={() => navigateToDay('next')}
                style={{ 
                  background: '#23232a', 
                  border: '1px solid #3a3a42', 
                  color: '#fff', 
                  borderRadius: 6, 
                  padding: '8px 12px', 
                  fontSize: 16, 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  fontWeight: 500
                }}
              >
                →
              </button>
            </div>
            <h3 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', margin: 0, color: isToday ? '#4e8cff' : '#fff' }}>
              {dayTitle}
            </h3>
          </div>
          
          {/* Right: Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              style={{ 
                background: 'linear-gradient(90deg,#4e8cff,#3aa7e7)', 
                color: '#fff', 
                fontWeight: 600, 
                border: 'none', 
                borderRadius: 8, 
                padding: '10px 20px', 
                fontSize: 15, 
                cursor: 'pointer', 
                boxShadow: '0 2px 8px #0004' 
              }}
              onClick={() => setShowSchedule(true)}
            >
              + Schedule Appointment
            </button>
            <button 
              onClick={onClose} 
              className={styles['close-btn']} 
              style={{ 
                fontSize: 24, 
                background: '#23232a', 
                border: '1px solid #3a3a42', 
                color: '#fff', 
                borderRadius: 6, 
                padding: '8px 12px',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div className={styles['modal-content']} style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', gap: 24 }}>
          {/* Left: Event Controls and Overview */}
          <div style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
            {/* Business Hours Info - matching day header height */}
            {dayHours && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '60px',
                background: '#18181c', 
                borderRadius: 8, 
                border: '1px solid #23232a'
              }}>
                <div style={{ fontSize: '14px', color: '#4e8cff', fontWeight: 600 }}>
                  Business Hours: {Math.floor(dayHours.startMinutes / 60)}:{String(dayHours.startMinutes % 60).padStart(2, '0')} - {Math.floor(dayHours.endMinutes / 60)}:{String(dayHours.endMinutes % 60).padStart(2, '0')}
                </div>
              </div>
            )}

            {/* Event List - remove Events (4) header */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {relevantEvents.length === 0 ? (
                <div style={{ 
                  color: '#aaa', 
                  fontStyle: 'italic', 
                  fontSize: 15, 
                  textAlign: 'center',
                  padding: '40px 20px'
                }}>
                  No events scheduled for this day
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto', flex: 1, paddingRight: 8 }}>
                  {relevantEvents.map((event, index) => {
                    const startParts = getDateParts(event.start);
                    const endParts = event.end ? getDateParts(event.end) : null;
                    const eventStart = new Date(event.start);
                    const eventEnd = event.end ? new Date(event.end) : null;
                    const isOngoing = Date.now() >= eventStart.getTime() && Date.now() < (eventEnd?.getTime() || 0);
                    const isBusy = busySet.has(event.calendarUrl) || (event.uid && forcedBusySet.has(event.uid));
                    const userOverrideColor = config?.colors?.[event.calendarUrl];
                    const baseColor = userOverrideColor || event.color || '#3aa7e7';
                    
                    return (
                      <div 
                        key={index} 
                        style={{
                          background: '#18181c',
                          borderRadius: 10,
                          padding: '16px',
                          color: '#fff',
                          border: isOngoing ? '2px solid #4e8cff' : `1px solid ${baseColor}40`,
                          boxShadow: isOngoing ? '0 4px 12px #4e8cff33' : '0 2px 8px #00000020',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => setSelectedEvent(event)}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          {/* Color indicator */}
                          <div 
                            style={{ 
                              width: 4, 
                              height: 40, 
                              borderRadius: 2, 
                              background: baseColor,
                              opacity: isBusy ? 1 : 0.6,
                              flexShrink: 0,
                              marginTop: 2
                            }} 
                          />
                          
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                              {event.summary}
                            </div>
                            
                            <div style={{ fontSize: 13, color: '#aaa', marginBottom: 6 }}>
                              {!event.start.includes('T') ? (
                                'All day'
                              ) : (
                                <>
                                  {String(startParts.hour).padStart(2, '0')}:{String(startParts.minute).padStart(2, '0')}
                                  {endParts && (
                                    <> - {String(endParts.hour).padStart(2, '0')}:{String(endParts.minute).padStart(2, '0')}</>
                                  )}
                                </>
                              )}
                            </div>
                            
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>
                              {event.calendar}
                            </div>
                            
                            {/* Status indicators */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ 
                                fontSize: 12, 
                                color: isOngoing ? '#4e8cff' : isBusy ? '#ffb84e' : '#888',
                                fontWeight: 500,
                                background: isOngoing ? '#4e8cff20' : isBusy ? '#ffb84e20' : 'transparent',
                                padding: '2px 6px',
                                borderRadius: 4
                              }}>
                                {isOngoing ? 'Ongoing' : isBusy ? 'Blocking' : 'Non-blocking'}
                              </span>
                            </div>
                            
                            {/* Quick actions */}
                            {event.uid && (
                              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleBusyEvent(event.uid!);
                                  }}
                                  style={{
                                    background: isBusy ? '#ffb84e' : '#23232a',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '6px 12px',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    fontWeight: 500
                                  }}
                                >
                                  {isBusy ? 'Mark Not Busy' : 'Mark Busy'}
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(event.uid!);
                                  }} 
                                  style={{ 
                                    background: '#ff4e4e', 
                                    color: '#fff', 
                                    border: 'none', 
                                    borderRadius: 6, 
                                    padding: '6px 12px', 
                                    fontSize: 12, 
                                    cursor: 'pointer', 
                                    fontWeight: 500 
                                  }} 
                                  disabled={deletingUid === event.uid}
                                >
                                  {deletingUid === event.uid ? 'Deleting...' : 'Delete'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Mini Calendar View */}
          <div style={{ flex: '1', minWidth: 500, display: 'flex', flexDirection: 'column' }}>
            {/* All-day events section */}
            {allDayEvents.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '14px', color: '#aaa', marginBottom: '8px' }}>All Day</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {allDayEvents.map((event, index) => {
                    const userOverrideColor = config?.colors?.[event.calendarUrl];
                    const baseColor = userOverrideColor || event.color || '#3aa7e7';
                    const isBusy = busySet.has(event.calendarUrl) || (event.uid && forcedBusySet.has(event.uid));
                    const eventColor = isBusy ? baseColor : shadeColor(baseColor, -30);
                    
                    return (
                      <div
                        key={index}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: eventColor,
                          color: '#fff',
                          fontSize: '13px',
                          fontWeight: '500',
                          opacity: isBusy ? 1 : 0.7
                        }}
                      >
                        {event.summary}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Main calendar grid - scrollable from 7am to 9pm */}
            <div className={styles.calendarGrid} style={{ 
              flex: '1', 
              display: 'flex', 
              maxHeight: '600px',
              overflow: 'auto',
              border: '1px solid #23232a',
              borderRadius: '8px',
              background: '#121216'
            }}>
              {/* Time column - sticky */}
              <div className={styles.timeColumn} style={{ 
                width: '60px', 
                display: 'flex', 
                flexDirection: 'column',
                borderRight: '1px solid #23232a',
                position: 'sticky',
                left: 0,
                background: '#121216',
                zIndex: 10
              }}>
                {/* Position time labels to align exactly with grid lines */}
                {hourRange.map((hour, index) => (
                  <div
                    key={hour}
                    style={{
                      position: 'absolute',
                      top: `${index * 60}px`, // Match the grid line position exactly
                      right: '8px',
                      fontSize: '12px',
                      color: '#aaa',
                      fontWeight: '500',
                      transform: 'translateY(-6px)', // Center the text on the line
                      zIndex: 2
                    }}
                  >
                    {formatHour(hour)}
                  </div>
                ))}
                
                {/* Spacer to maintain height */}
                <div style={{ height: `${hourRange.length * 60}px` }} />
              </div>

              {/* Day grid with precise positioning */}
              <div className={styles.dayGrid} style={{ 
                flex: '1', 
                position: 'relative',
                minHeight: `${hourRange.length * 60}px`
              }}>
                {/* Hour grid lines */}
                {hourRange.map((hour, index) => (
                  <div
                    key={hour}
                    style={{
                      position: 'absolute',
                      top: `${index * 60}px`,
                      left: '0',
                      right: '0',
                      height: '1px',
                      background: '#23232a',
                      zIndex: 1
                    }}
                  />
                ))}

                {/* Business hours lines - opening (green) and closing (red) */}
                {dayHours && (
                  <>
                    {/* Opening time - green line */}
                    {dayHours.startMinutes >= windowStartMinutes && dayHours.startMinutes < windowStartMinutes + daySpanMinutes && (
                      <div
                        style={{
                          position: 'absolute',
                          top: `${((dayHours.startMinutes - windowStartMinutes) / daySpanMinutes) * (hourRange.length * 60)}px`,
                          left: '0',
                          right: '0',
                          height: '3px',
                          background: 'linear-gradient(90deg, #4ade80, #22c55e)',
                          borderRadius: '2px',
                          zIndex: 5,
                          boxShadow: '0 0 8px rgba(34, 197, 94, 0.5)'
                        }}
                      />
                    )}
                    
                    {/* Closing time - red line */}
                    {dayHours.endMinutes >= windowStartMinutes && dayHours.endMinutes < windowStartMinutes + daySpanMinutes && (
                      <div
                        style={{
                          position: 'absolute',
                          top: `${((dayHours.endMinutes - windowStartMinutes) / daySpanMinutes) * (hourRange.length * 60)}px`,
                          left: '0',
                          right: '0',
                          height: '3px',
                          background: 'linear-gradient(90deg, #ff4e4e, #ff6b6b)',
                          borderRadius: '2px',
                          zIndex: 5,
                          boxShadow: '0 0 8px rgba(255, 78, 78, 0.5)'
                        }}
                      />
                    )}
                  </>
                )}

                {/* Current time line */}
                {isToday && (() => {
                  const now = new Date();
                  const nowMinutes = now.getHours() * 60 + now.getMinutes();
                  if (nowMinutes >= windowStartMinutes && nowMinutes < windowStartMinutes + daySpanMinutes) {
                    return (
                      <div
                        style={{
                          position: 'absolute',
                          top: `${((nowMinutes - windowStartMinutes) / daySpanMinutes) * (hourRange.length * 60)}px`,
                          left: '0',
                          right: '0',
                          height: '2px',
                          background: 'linear-gradient(90deg, #ff4e4e, #ffb84e)',
                          borderRadius: '1px',
                          zIndex: 10,
                          boxShadow: '0 0 8px rgba(255, 78, 78, 0.5)'
                        }}
                      />
                    );
                  }
                  return null;
                })()}

                {/* Events */}
                {processedEvents.map((event, index) => {
                  const isBusy = busySet.has(event.calendarUrl) || (event.uid && forcedBusySet.has(event.uid));
                  const eventColor = isBusy ? event.__baseColor : shadeColor(event.__baseColor || '#3aa7e7', -30);
                  
                  return (
                    <div
                      key={index}
                      style={{
                        position: 'absolute',
                        top: `${event.__top * (hourRange.length * 60)}px`,
                        height: `${Math.max(event.__height * (hourRange.length * 60), 20)}px`,
                        left: '4px',
                        right: '4px',
                        background: eventColor,
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        zIndex: 5,
                        opacity: isBusy ? 1 : 0.7,
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}
                      onClick={() => setSelectedEvent(event)}
                    >
                      <div style={{ fontWeight: '600', marginBottom: '2px' }}>
                        {event.summary}
                      </div>
                      <div style={{ fontSize: '11px', opacity: 0.9 }}>
                        {getDateParts(event.start).hour.toString().padStart(2, '0')}:
                        {getDateParts(event.start).minute.toString().padStart(2, '0')}
                        {event.end && (
                          <>
                            {' - '}
                            {getDateParts(event.end).hour.toString().padStart(2, '0')}:
                            {getDateParts(event.end).minute.toString().padStart(2, '0')}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Event Details Modal */}
        {selectedEvent && (
          <EventModal
            event={selectedEvent}
            config={config}
            onClose={() => setSelectedEvent(null)}
          />
        )}

        {/* Scheduling Modal - when open, close this day modal temporarily */}
        {showSchedule && (
          <ScheduleAppointmentModal
            open={true}
            onClose={() => setShowSchedule(false)}
            onScheduled={() => {
              setShowSchedule(false);
              onConfigUpdate();
            }}
            defaultDate={dateStr}
            eventToGoBackTo={() => setShowSchedule(false)}
          />
        )}
          </div>
        </div>
      )}

      {/* Scheduling Modal - renders outside the day modal */}
      {showSchedule && (
        <ScheduleAppointmentModal
          open={true}
          onClose={() => setShowSchedule(false)}
          onScheduled={() => {
            setShowSchedule(false);
            onConfigUpdate();
          }}
          defaultDate={dateStr}
          eventToGoBackTo={() => setShowSchedule(false)}
        />
      )}
    </>,
    document.body
  );
}
