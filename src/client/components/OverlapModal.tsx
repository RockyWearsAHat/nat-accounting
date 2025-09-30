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
  // Use proper timezone conversion (consistent with WeeklyCalendar)
  const getDateParts = (dateISO: string) => {
    try {
      // Always use Date object to properly handle timezone conversion
      // This ensures UTC timestamps are converted to local time for display
      const date = new Date(dateISO);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn(`[OverlapModal] Invalid date: ${dateISO}`);
        return { year: 1970, month: 1, day: 1, hour: 0, minute: 0 };
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

  const formatEventTime = (event: CalendarEvent) => {
    const startParts = getDateParts(event.start);
    const endParts = event.end ? getDateParts(event.end) : null;
    
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
            // Prioritize user-configured color over event color
            const color = (config?.colors?.[event.calendarUrl]) || event.color || "#3aa7e7";
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