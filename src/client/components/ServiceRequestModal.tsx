import React, { useState } from "react";
import { createPortal } from "react-dom";
import { http } from "../lib/http";
import styles from "./ServiceRequestModal.module.css";

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
  "Other (specify in notes)",
];

interface ServiceRequestModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const ServiceRequestModal: React.FC<ServiceRequestModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedServices.length === 0) {
      setError("Please select at least one service");
      return;
    }

    try {
      setLoading(true);
      setError("");

      await http.post("/api/client/requests", {
        services: selectedServices,
        notes,
      });

      alert("Service request submitted successfully! Our team will review and contact you shortly.");
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Failed to submit service request:", err);
      setError(err.message || "Failed to submit request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Request Services</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label}>
              Select Services * ({selectedServices.length} selected)
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
            <label className={styles.label}>Additional Notes</label>
            <textarea
              className={styles.textarea}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Tell us more about your needs, company size, transaction volume, etc."
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
              disabled={loading || selectedServices.length === 0}
            >
              {loading ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
