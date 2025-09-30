import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { http } from "../lib/http";
import { CalendarEvent, AvailabilitySlot } from "../types/calendar";
import styles from "./modernCalendar.module.css";
import { DateTime } from "luxon";

interface Props {
  open: boolean;
  onClose: () => void;
  onScheduled: (newEvent: CalendarEvent) => void; // Pass the new event directly to parent
  defaultDate?: string;
  eventToGoBackTo?: () => void; // Optional callback to show back button and handle back navigation
}


export const ScheduleAppointmentModal: React.FC<Props> = ({ open, onClose, onScheduled, defaultDate, eventToGoBackTo }) => {
  const [form, setForm] = useState({
    name: "",
    description: "",
    location: "",
    videoUrl: "",
    date: defaultDate || "",
    time: "",
    length: 30,
  });
  useEffect(() => {
    if (defaultDate) setForm(f => ({ ...f, date: defaultDate }));
    // eslint-disable-next-line
  }, [defaultDate]);
  // Default to Mountain Time, but could fetch from settings API if needed
  const TIMEZONE = "America/Denver";
  const [buffer, setBuffer] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    if (e.target.name === "date" || e.target.name === "length") {
      setSelectedSlot(null);
    }
  };

  // Fetch slots (called on blur of length or buffer)
  const fetchSlots = () => {
    if (form.date && form.length) {
      let bufNum = parseInt(buffer, 10);
      if (isNaN(bufNum) || bufNum < 0) bufNum = 0;
  http.get<{ slots: AvailabilitySlot[] }>(`/api/availability`, {
        date: form.date,
        duration: form.length,
        buffer: bufNum,
      }).then(data => setSlots(data.slots || [])).catch(() => setSlots([]));
      // Fetch all events for the day to check overlaps
      http.get<{ events: CalendarEvent[] }>(`/api/icloud/day`, { date: form.date })
        .then(data => setEvents(data.events || []))
        .catch(() => setEvents([]));
    } else {
      setSlots([]);
      setEvents([]);
    }
  };
  // Handle blur for length input: parse to number, default to 30 if invalid, trigger slot fetch
  const handleLengthBlur = () => {
    let val = parseInt(form.length as any, 10);
    if (isNaN(val) || val <= 0) val = 30;
    if (val !== form.length) setForm(f => ({ ...f, length: val }));
    setTimeout(fetchSlots, 0);
  };
  const handleBufferBlur = () => {
    let bufNum = parseInt(buffer, 10);
    if (isNaN(bufNum) || bufNum < 0) bufNum = 0;
    setBuffer(bufNum.toString());
    setTimeout(fetchSlots, 0);
  };

  // Fetch available slots when date and length are set
  useEffect(() => {
    fetchSlots();
    // eslint-disable-next-line
  }, [form.date, form.length]);

  // Check for overlap only if custom time is entered (not when using available slots)
  useEffect(() => {
    // If a slot is selected from the available slots, there should be no overlap warning
    // since available slots are already verified by the backend to be non-overlapping
    if (selectedSlot) {
      setOverlapWarning(null);
      return;
    }

    if (!form.date || !form.time || !form.length || !events.length) {
      setOverlapWarning(null);
      return;
    }

    // Only check for overlaps when user manually enters a custom time
    // Parse start/end in business timezone
    const start = DateTime.fromISO(`${form.date}T${form.time}`, { zone: TIMEZONE });
    const end = start.plus({ minutes: Number(form.length) });
    
    const overlap = events.find(ev => {
      // Skip non-blocking events (only blocking events should cause overlap warnings)
      // If blocking is undefined, assume it's blocking (default behavior)
      if (ev.blocking === false) return false;
      
      // Events from API: parse as local Mountain Time (matches calendar display logic)
      // Remove the 'Z' suffix and parse as local time to get correct 12:25 PM interpretation
      const evStartStr = ev.start.replace('Z', '');
      const evEndStr = ev.end ? ev.end.replace('Z', '') : null;
      const evStart = DateTime.fromISO(evStartStr, { zone: TIMEZONE });
      const evEnd = evEndStr ? DateTime.fromISO(evEndStr, { zone: TIMEZONE }) : evStart.plus({ minutes: 30 });
      
      return (start < evEnd && end > evStart);
    });
    
    if (overlap) {
      // Events are stored as UTC in database, need to parse them correctly
      // Use the same logic as the overlap detection for consistency
      const displayStartStr = overlap.start.replace('Z', '');
      const displayEndStr = overlap.end ? overlap.end.replace('Z', '') : null;
      const displayStart = DateTime.fromISO(displayStartStr, { zone: TIMEZONE });
      const displayEnd = displayEndStr ? DateTime.fromISO(displayEndStr, { zone: TIMEZONE }) : displayStart.plus({ minutes: 30 });
      setOverlapWarning(`This appointment overlaps with "${overlap.summary}" (${displayStart.toLocaleString(DateTime.TIME_SIMPLE)} - ${displayEnd.toLocaleString(DateTime.TIME_SIMPLE)}). Are you sure?`);
    } else {
      setOverlapWarning(null);
    }
  }, [form.date, form.time, form.length, events, selectedSlot]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    let start: DateTime;
    if (selectedSlot) {
      // selectedSlot is ISO string in business timezone
      start = DateTime.fromISO(selectedSlot, { zone: TIMEZONE });
    } else {
      start = DateTime.fromISO(`${form.date}T${form.time}`, { zone: TIMEZONE });
    }
    const lengthMinutes = Number(form.length);
    const end = start.plus({ minutes: lengthMinutes });
    
    // Create optimistic event - show instantly in parent
    const optimisticEvent: CalendarEvent = {
      uid: `temp-${Date.now()}`,
      summary: `${form.name} (Scheduling...)`,
      start: start.toISO() || '',
      end: end.toISO() || '',
      calendar: 'Business',
      calendarUrl: 'business',
      color: '#9ca3af',
      blocking: true
    };
    
    // INSTANT FEEDBACK: Show in parent immediately
    onScheduled(optimisticEvent);
    onClose();
    
    try {
      console.log("Scheduling appointment with data:", {
        summary: form.name,
        description: form.description,
        location: form.location,
        videoUrl: form.videoUrl,
        start: start.toISO(),
        end: end.toISO(),
        calendarId: "Business",
        provider: "icloud",
      });

      const res = await fetch("/api/calendar/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: form.name,
          description: form.description,
          location: form.location,
          videoUrl: form.videoUrl,
          start: start.toISO(),
          end: end.toISO(),
          calendarId: "Business",
          provider: "icloud",
        }),
      });
      
      console.log("Schedule response status:", res.status, res.statusText);
      
      if (!res.ok) {
        let errorMessage = "Failed to schedule appointment";
        try {
          const errorData = await res.json();
          console.log("Schedule error data:", errorData);
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (parseError) {
          console.error("Failed to parse error response:", parseError);
          errorMessage = `Failed to schedule appointment: ${res.status} ${res.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const responseData = await res.json();
      console.log("Schedule success response:", responseData);
      
      // Success: Server confirmed the appointment was created
      // Optimistic update already happened, no need to do anything more
      console.log(`[SCHEDULE] Server confirmed appointment: ${optimisticEvent.summary}`);
      
    } catch (e: any) {
      console.error(`[SCHEDULE] Failed to create appointment:`, e);
      
      // TODO: Need to tell parent to remove the optimistic event
      // For now, just show error (the optimistic event will remain until page refresh)
      setError(e.message || "Unknown error");
      setLoading(false);
      return; // Don't close modal on error
    }
    
    // Success cleanup
    setLoading(false);
  };
  if (!open) return null;
  return createPortal(
    <div 
      className={styles['modal-overlay']} 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(18, 18, 24, 0.92)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div 
        className={styles['schedule-modal']} 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxHeight: '90vh', 
          overflow: 'auto', 
          minWidth: 700, 
          maxWidth: 900, 
          width: 'min(95vw, 900px)',
          background: '#18181c',
          borderRadius: '18px',
          padding: '32px',
          color: '#fff',
          position: 'relative',
          boxShadow: '0 8px 40px 0 rgba(0,0,0,0.8), 0 1.5px 0 #23232a',
          zIndex: 10000
        }}
      >
        {eventToGoBackTo ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button 
              type="button" 
              onClick={eventToGoBackTo} 
              className={styles['close-btn']} 
              style={{ fontSize: 18, background: 'none', color: '#fff', marginRight: 8 }}
            >
              &larr; Back
            </button>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Schedule Appointment</h2>
            <span style={{ width: 40 }} />
          </div>
        ) : (
          <h2 style={{ marginBottom: 16 }}>Schedule Appointment</h2>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          {/* Left column: Info */}
          <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ fontWeight: 500 }}>Name*
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                style={{ width: '100%', marginTop: 4, padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #e5e5e5' }}
              />
            </label>
            <label style={{ fontWeight: 500 }}>Description
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                style={{ width: '100%', marginTop: 4, padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #e5e5e5', minHeight: 60 }}
              />
            </label>
            <label style={{ fontWeight: 500 }}>Location
              <input
                name="location"
                value={form.location}
                onChange={handleChange}
                style={{ width: '100%', marginTop: 4, padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #e5e5e5' }}
              />
            </label>
            <label style={{ fontWeight: 500 }}>Video Call Link
              <input
                name="videoUrl"
                value={form.videoUrl}
                onChange={handleChange}
                style={{ width: '100%', marginTop: 4, padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #e5e5e5' }}
              />
            </label>
          </div>
          {/* Right column: Date/Time/Slots */}
          <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ fontWeight: 500 }}>Date*
              <input
                name="date"
                type="date"
                value={form.date}
                onChange={handleChange}
                required
                style={{ width: '100%', marginTop: 4, padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #e5e5e5' }}
              />
            </label>
            <label style={{ fontWeight: 500 }}>Length (minutes)
              <input
                name="length"
                type="text"
                value={form.length}
                onChange={handleChange}
                onBlur={handleLengthBlur}
                style={{ width: '100%', marginTop: 4, padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #e5e5e5' }}
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </label>
            <label style={{ fontWeight: 500 }}>Buffer between appointments (min)
              <input
                name="buffer"
                type="text"
                value={buffer}
                onChange={e => setBuffer(e.target.value)}
                onBlur={handleBufferBlur}
                style={{ width: '100%', marginTop: 4, padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #e5e5e5' }}
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </label>
            {form.date && form.length && slots.length > 0 && (
              <div>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Available Timeslots:</div>
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8, padding: 8, background: '#fafbfc', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {slots.filter(slot => {
                    // Only show available slots
                    if (!slot.available) return false;
                    
                    // If the selected date is today, only show slots that haven't passed yet
                    const slotStart = DateTime.fromISO(slot.start, { zone: TIMEZONE });
                    const selectedDate = DateTime.fromISO(form.date, { zone: TIMEZONE });
                    const today = DateTime.now().setZone(TIMEZONE);
                    
                    // If scheduling for today, filter out past slots
                    if (selectedDate.hasSame(today, 'day')) {
                      return slotStart > today;
                    }
                    
                    // If scheduling for a future date, show all available slots
                    return true;
                  }).map(slot => {
                    const slotStart = DateTime.fromISO(slot.start, { zone: TIMEZONE });
                    const slotEnd = DateTime.fromISO(slot.end, { zone: TIMEZONE });
                    return (
                      <button
                        type="button"
                        key={slot.start}
                        className={selectedSlot === slot.start ? styles.btnPrimary : styles.btnSecondary}
                        style={{ minWidth: 120 }}
                        onClick={() => {
                          setSelectedSlot(slot.start);
                          setForm(f => ({ ...f, time: slotStart.toFormat("HH:mm") }));
                        }}
                      >
                        {slotStart.toLocaleString(DateTime.TIME_SIMPLE)} - {slotEnd.toLocaleString(DateTime.TIME_SIMPLE)}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: '0.97rem', color: '#888', marginTop: 4 }}>Or enter a custom time below:</div>
              </div>
            )}
            <label>Time*<input name="time" type="time" value={form.time} onChange={e => { setSelectedSlot(null); handleChange(e); }} required /></label>
            {overlapWarning && (
              <div className={styles.errorMsg} style={{ fontWeight: 500, background: '#fffbe6', color: '#b26a00', border: '1px solid #ffe58f', borderRadius: 6, padding: '8px 12px', marginBottom: 4 }}>
                {overlapWarning}
              </div>
            )}
            {error && <div className={styles.errorMsg}>{error}</div>}
            <div className={styles.modalActions}>
              <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancel</button>
              <button type="submit" className={styles.btnPrimary} disabled={loading}>{loading ? "Scheduling..." : "Schedule"}</button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
