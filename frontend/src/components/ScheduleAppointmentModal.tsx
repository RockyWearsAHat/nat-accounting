import React, { useState, useEffect } from "react";
import { http } from "../lib/http";
import { CalendarEvent } from "../types/calendar";
import styles from "./modernCalendar.module.css";
import { DateTime } from "luxon";

interface Props {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}


export const ScheduleAppointmentModal: React.FC<Props> = ({ open, onClose, onScheduled }) => {
  const [form, setForm] = useState({
    name: "",
    description: "",
    location: "",
    videoUrl: "",
    date: "",
    time: "",
    length: 30,
  });
  // Default to Mountain Time, but could fetch from settings API if needed
  const TIMEZONE = "America/Denver";
  const [buffer, setBuffer] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
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
  http.get<{ slots: { start: string; end: string }[] }>(`/api/availability`, {
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

  // Check for overlap if custom time is entered
  useEffect(() => {
    if (!form.date || !form.time || !form.length || !events.length) {
      setOverlapWarning(null);
      return;
    }
    // Parse start/end in business timezone
    const start = DateTime.fromISO(`${form.date}T${form.time}`, { zone: TIMEZONE });
    const end = start.plus({ minutes: Number(form.length) });
    const overlap = events.find(ev => {
      const evStart = DateTime.fromISO(ev.start, { zone: TIMEZONE });
      const evEnd = ev.end ? DateTime.fromISO(ev.end, { zone: TIMEZONE }) : evStart.plus({ minutes: 30 });
      return (start < evEnd && end > evStart);
    });
    if (overlap) {
      setOverlapWarning(`This appointment overlaps with "${overlap.summary}" (${DateTime.fromISO(overlap.start, { zone: TIMEZONE }).toLocaleString(DateTime.TIME_SIMPLE)} - ${overlap.end ? DateTime.fromISO(overlap.end, { zone: TIMEZONE }).toLocaleString(DateTime.TIME_SIMPLE) : ''}). Are you sure?`);
    } else {
      setOverlapWarning(null);
    }
  }, [form.date, form.time, form.length, events]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let start: DateTime;
      if (selectedSlot) {
        // selectedSlot is ISO string in business timezone
        start = DateTime.fromISO(selectedSlot, { zone: TIMEZONE });
      } else {
        start = DateTime.fromISO(`${form.date}T${form.time}`, { zone: TIMEZONE });
      }
      const lengthMinutes = Number(form.length);
      const end = start.plus({ minutes: lengthMinutes });
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
      if (!res.ok) throw new Error("Failed to schedule appointment");
      onScheduled();
      onClose();
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };
  if (!open) return null;
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard} style={{ maxHeight: '90vh', overflow: 'auto', minWidth: 600, width: 'min(90vw, 800px)' }}>
        <h2 style={{ marginBottom: 16 }}>Schedule Appointment</h2>
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
                  {slots.map(slot => {
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
    </div>
  );
};
