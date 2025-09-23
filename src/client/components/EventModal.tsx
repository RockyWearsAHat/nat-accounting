import React from "react";
import styles from "./calendar.module.css";
import { CalendarEvent, CalendarConfig } from "../types/calendar";

interface EventModalProps {
  event: CalendarEvent;
  config: CalendarConfig | null;
  onClose: () => void;
}

export const EventModal: React.FC<EventModalProps> = ({ event, config, onClose }) => {
  // Parse time directly without timezone conversion (server sends Mountain Time as .000Z)
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
  
  const startParts = parseEventTime(event.start);
  const endParts = event.end ? parseEventTime(event.end) : null;
  const color = event.color || (config?.colors?.[event.calendarUrl] ?? "#3aa7e7");
  return (
    <div className={styles['modal-overlay']} onClick={onClose}>
      <div className={styles['day-modal']} onClick={e => e.stopPropagation()}>
        <div className={styles['modal-header']}>
          <h3 style={{ color: color, margin: 0, fontSize: 18, fontWeight: 600 }}>{event.summary}</h3>
          <button onClick={onClose} className={styles['close-btn']}>
            ×
          </button>
        </div>
        <div className={styles['modal-content']}>
          <div style={{ marginBottom: 12, color: '#fff', fontWeight: 400 }}>
            {startParts.month}/{startParts.day}/{startParts.year} {String(startParts.hour % 12 || 12).padStart(2, '0')}:{String(startParts.minute).padStart(2, '0')} {startParts.hour >= 12 ? 'PM' : 'AM'}
            {endParts && (
              <> – {String(endParts.hour % 12 || 12).padStart(2, '0')}:{String(endParts.minute).padStart(2, '0')} {endParts.hour >= 12 ? 'PM' : 'AM'}</>
            )}
          </div>
          <div style={{ fontSize: 14, color: color, fontWeight: 600, marginBottom: 8 }}>{event.calendar}</div>
          {/* No description/location fields in CalendarEvent type */}
        </div>
      </div>
    </div>
  );
};
