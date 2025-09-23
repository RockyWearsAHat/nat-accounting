import React from "react";
import styles from "./calendar.module.css";
import { CalendarEvent, CalendarConfig } from "../types/calendar";

interface OverlapModalProps {
  events: CalendarEvent[];
  config: CalendarConfig | null;
  onClose: () => void;
  onEventSelect: (event: CalendarEvent) => void;
}

export const OverlapModal: React.FC<OverlapModalProps> = ({ events, config, onClose, onEventSelect }) => {
  // Parse time directly without timezone conversion (already Mountain Time)
  const parseEventTime = (dateISO: string) => {
    const match = dateISO.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.000Z$/);
    if (match) {
      const [, year, month, day, hour, minute] = match;
      return {
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        day: parseInt(day, 10), 
        hour: parseInt(hour, 10),
        minute: parseInt(minute, 10),
      };
    }
    // Fallback to Date parsing (may cause timezone issues)
    const date = new Date(dateISO);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  };

  const formatEventTime = (event: CalendarEvent) => {
    const startParts = parseEventTime(event.start);
    const endParts = event.end ? parseEventTime(event.end) : null;
    
    const formatTime = (hour: number, minute: number) => {
      const displayHour = hour % 12 || 12;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      return `${displayHour}:${String(minute).padStart(2, '0')} ${ampm}`;
    };
    
    const startTime = formatTime(startParts.hour, startParts.minute);
    const endTime = endParts ? formatTime(endParts.hour, endParts.minute) : null;
    
    return `${startParts.month}/${startParts.day}/${startParts.year} ${startTime}${endTime ? ` - ${endTime}` : ''}`;
  };

  return (
    <div className={styles['modal-overlay']} onClick={onClose}>
      <div className={styles['day-modal']} onClick={e => e.stopPropagation()}>
        <div className={styles['modal-header']}>
          <h3 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 600 }}>Overlapping Events</h3>
          <button onClick={onClose} className={styles['close-btn']}>
            ×
          </button>
        </div>
        <div className={styles['modal-content']}>
          <p style={{ fontSize: 14, color: '#ccc', marginBottom: 16, margin: 0 }}>
            Multiple events are scheduled at the same time. Click on an event to view details.
          </p>
          
          {events.map((event, i) => {
            const color = event.color || (config?.colors?.[event.calendarUrl] ?? "#3aa7e7");
            return (
              <div 
                key={i}
                style={{
                  background: '#23232a',
                  border: `1px solid #333339`,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => onEventSelect(event)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#2a2a31';
                  e.currentTarget.style.borderColor = color;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#23232a';
                  e.currentTarget.style.borderColor = '#333339';
                }}
              >
                <div style={{ 
                  fontSize: 16, 
                  fontWeight: 600, 
                  color: color, 
                  marginBottom: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <div 
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: color,
                      flexShrink: 0
                    }}
                  />
                  {event.summary}
                </div>
                <div style={{ fontSize: 13, color: '#fff', marginBottom: 2 }}>
                  {formatEventTime(event)}
                </div>
                <div style={{ fontSize: 12, color: color, fontWeight: 600 }}>
                  {event.calendar}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};