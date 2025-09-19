import React from "react";
import styles from "./calendar.module.css";
import { CalendarEvent, CalendarConfig } from "../types/calendar";

interface EventModalProps {
  event: CalendarEvent;
  config: CalendarConfig | null;
  onClose: () => void;
}

export const EventModal: React.FC<EventModalProps> = ({ event, config, onClose }) => {
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;
  const color = event.color || (config?.colors?.[event.calendarUrl] ?? "#3aa7e7");
  return (
    <div className={styles['modal-overlay']} onClick={onClose}>
      <div className={styles['day-modal']} onClick={e => e.stopPropagation()}>
        <div className={styles['modal-header']}>
          <h3>{event.summary}</h3>
          <button onClick={onClose} className={styles['close-btn']}>
            ×
          </button>
        </div>
        <div className={styles['modal-content']}>
          <div style={{ marginBottom: 12, color: color, fontWeight: 600 }}>
            {start.toLocaleDateString()} {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {end && (
              <> – {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
            )}
          </div>
          <div style={{ fontSize: 14, color: '#b0b0c3', marginBottom: 8 }}>{event.calendar}</div>
          {/* No description/location fields in CalendarEvent type */}
        </div>
        <div style={{ marginTop: 18 }}>
          <button className={styles['close-btn']} onClick={onClose} style={{ fontSize: 18, padding: '6px 18px', background: '#23232a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  );
};
