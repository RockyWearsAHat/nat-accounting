import React from "react";
import styles from "./calendar.module.css";
import { CalendarEvent, CalendarConfig } from "../types/calendar";

interface EventModalProps {
  event: CalendarEvent;
  config: CalendarConfig | null;
  onClose: () => void;
}

export const EventModal: React.FC<EventModalProps> = ({ event, config, onClose }) => {
  // Use proper timezone conversion (consistent with WeeklyCalendar)
  const getDateParts = (dateISO: string) => {
    try {
      // Always use Date object to properly handle timezone conversion
      // This ensures UTC timestamps are converted to local time for display
      const date = new Date(dateISO);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn(`[EventModal] Invalid date: ${dateISO}`);
        return { year: '1970', month: '01', day: '01', hour: 0, minute: 0 };
      }
      
      return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(), // This gives local hours
        minute: date.getMinutes(), // This gives local minutes
      };
    } catch {
      return { year: 1970, month: 1, day: 1, hour: 0, minute: 0 };
    }
  };
  
  const startParts = getDateParts(event.start);
  const endParts = event.end ? getDateParts(event.end) : null;
  // Prioritize user-configured color over event color
  const color = (config?.colors?.[event.calendarUrl]) || event.color || "#3aa7e7";
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
