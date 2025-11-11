import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { http } from "../lib/http";
import styles from "./ClientScheduleModal.module.css";

interface TimeSlot {
  start: string;
  end: string;
}

interface ClientScheduleModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const AVAILABLE_SERVICES = [
  "Bookkeeping (monthly)",
  "Bank & Credit Reconciliations",
  "Financial Statement Preparation",
  "Accounting Software Implementation",
  "Advisory / Strategic Financial Guidance",
  "Accounts Receivable (AR) Management",
  "Accounts Payable (AP) Management",
  "Cash Flow Forecasting / Budgeting",
  "One-Time Financial Clean-Up",
  "Tax Preparation",
  "Payroll Services",
  "Other",
];

export const ClientScheduleModal: React.FC<ClientScheduleModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [selectedDate, setSelectedDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [description, setDescription] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Get today's date in YYYY-MM-DD format
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  // Load available slots when date changes
  useEffect(() => {
    if (selectedDate) {
      loadAvailableSlots();
    }
  }, [selectedDate]);

  const loadAvailableSlots = async () => {
    try {
      setLoading(true);
      setError("");
      const slots = await http.get<TimeSlot[]>(
        `/api/availability?date=${selectedDate}&duration=30&buffer=15`
      );
      setAvailableSlots(slots);
      setSelectedSlot(null);
    } catch (err) {
      console.error("Failed to load available slots:", err);
      setError("Failed to load available times. Please try another date.");
      setAvailableSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const toggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSlot) {
      setError("Please select a time slot");
      return;
    }

    if (!clientName || !clientEmail) {
      setError("Please fill in all required fields");
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Create service request if services selected
      if (selectedServices.length > 0) {
        await http.post("/api/client/requests", {
          services: selectedServices,
          notes: description,
        });
      }

      await http.post("/api/calendar/schedule", {
        start: selectedSlot.start,
        end: selectedSlot.end,
        summary: `Appointment - ${clientName}`,
        description: `Client: ${clientName}\nEmail: ${clientEmail}\n\nServices Requested: ${selectedServices.join(", ") || "None"}\n\n${description}`,
        location: "Virtual Meeting",
      });

      alert("Appointment scheduled successfully! You'll receive a confirmation email.");
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Failed to schedule appointment:", err);
      setError(err.message || "Failed to schedule appointment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Schedule Appointment</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label}>Your Name *</label>
            <input
              type="text"
              className={styles.input}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Your Email *</label>
            <input
              type="email"
              className={styles.input}
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Select Date *</label>
            <input
              type="date"
              className={styles.input}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={getMinDate()}
              required
              disabled={loading}
            />
          </div>

          {selectedDate && (
            <div className={styles.field}>
              <label className={styles.label}>
                Available Times {loading && "(Loading...)"}
              </label>
              {availableSlots.length === 0 && !loading && (
                <p className={styles.noSlots}>
                  No available times on this date. Please select another date.
                </p>
              )}
              <div className={styles.slots}>
                {availableSlots.map((slot, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`${styles.slotButton} ${
                      selectedSlot === slot ? styles.slotSelected : ""
                    }`}
                    onClick={() => setSelectedSlot(slot)}
                    disabled={loading}
                  >
                    {formatTime(slot.start)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>
              Services Needed (Optional) {selectedServices.length > 0 && `(${selectedServices.length} selected)`}
            </label>
            <div className={styles.servicesList}>
              {AVAILABLE_SERVICES.map((service) => (
                <label key={service} className={styles.serviceItem}>
                  <input
                    type="checkbox"
                    checked={selectedServices.includes(service)}
                    onChange={() => toggleService(service)}
                    disabled={loading}
                    className={styles.checkbox}
                  />
                  <span className={styles.serviceName}>{service}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Notes (Optional)</label>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What would you like to discuss?"
              disabled={loading}
            />
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading || !selectedSlot}
            >
              {loading ? "Scheduling..." : "Schedule Appointment"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
