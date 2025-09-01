import React, { useState } from "react";
import axios from "axios";

interface FormState {
  name: string;
  email: string;
  phone: string;
  company: string;
  website?: string;
  revenueApprox?: number;
  dunsNumber?: string;
  numberOfSubsidiaries?: number;
  transactionsPerMonth?: number;
  reconciliationAccounts?: number;
  wantsBookkeeping?: boolean;
  wantsReconciliations?: boolean;
  wantsFinancials?: boolean;
  wantsSoftwareImplementation?: boolean;
  wantsAdvisory?: boolean;
  wantsAR?: boolean;
  wantsAP?: boolean;
  wantsCleanup?: boolean;
  wantsForecasting?: boolean;
  wantsWebsiteHelp?: boolean;
  goals?: string;
}

const initial: FormState = { name: "", email: "", phone: "", company: "" };

export const ConsultationForm: React.FC = () => {
  const [form, setForm] = useState<FormState>(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const { data } = await axios.post("/api/consultations", form);
      if (data.ok) {
        setStatus("Submitted. We will reach out soon.");
        setForm(initial);
      } else setStatus("Submission failed.");
    } catch (err: any) {
      setStatus(
        err.response?.data?.error
          ? "Validation issue – please review fields."
          : "Network error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const cb = (k: keyof FormState) => ({
    checked: Boolean((form as any)[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      update({ [k]: e.target.checked } as any),
  });

  const text = (k: keyof FormState, type = "text", placeholder?: string) => (
    <input
      required={["name", "email", "phone", "company"].includes(k)}
      type={type}
      placeholder={placeholder}
      value={(form as any)[k] || ""}
      onChange={(e) =>
        update({
          [k]: type === "number" ? Number(e.target.value) : e.target.value,
        } as any)
      }
      style={inputStyle}
    />
  );

  return (
    <form
      onSubmit={submit}
      style={{ display: "grid", gap: "1rem", maxWidth: 800 }}
    >
      <div style={grid2}>
        {text("name", "text", "Name")}
        {text("email", "email", "Email")}
      </div>
      <div style={grid2}>
        {text("phone", "text", "Phone")}
        {text("company", "text", "Company")}
      </div>
      {text("website", "text", "Website (optional)")}
      <div style={grid2}>
        {text("dunsNumber", "text", "DUNS Number (optional)")}
        {text("numberOfSubsidiaries", "number", "# Subsidiaries")}
      </div>
      <div style={grid3}>
        {text("revenueApprox", "number", "Revenue (USD)")}
        {text("transactionsPerMonth", "number", "Transactions / month")}
        {text("reconciliationAccounts", "number", "# Accounts to Reconcile")}
      </div>
      <textarea
        placeholder="Goals / Notes"
        value={form.goals || ""}
        onChange={(e) => update({ goals: e.target.value })}
        style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
      />
      <fieldset style={fieldsetStyle}>
        <legend style={{ padding: "0 0.5rem" }}>Requested Services</legend>
        <div style={serviceGrid}>
          <label>
            <input type="checkbox" {...cb("wantsBookkeeping")} /> Bookkeeping
          </label>
          <label>
            <input type="checkbox" {...cb("wantsReconciliations")} />{" "}
            Reconciliations
          </label>
          <label>
            <input type="checkbox" {...cb("wantsFinancials")} /> Financial
            Statements
          </label>
          <label>
            <input type="checkbox" {...cb("wantsSoftwareImplementation")} />{" "}
            Software Implementation
          </label>
          <label>
            <input type="checkbox" {...cb("wantsAdvisory")} /> Advisory
          </label>
          <label>
            <input type="checkbox" {...cb("wantsAR")} /> Accounts Receivable
          </label>
          <label>
            <input type="checkbox" {...cb("wantsAP")} /> Accounts Payable
          </label>
          <label>
            <input type="checkbox" {...cb("wantsForecasting")} /> Forecasting
          </label>
          <label>
            <input type="checkbox" {...cb("wantsCleanup")} /> Financial Clean-Up
          </label>
          <label>
            <input type="checkbox" {...cb("wantsWebsiteHelp")} /> Website Help
          </label>
        </div>
      </fieldset>
      <button disabled={submitting} style={buttonStyle}>
        {submitting ? "Submitting..." : "Submit Consultation"}
      </button>
      {status && <div style={{ fontSize: 14 }}>{status}</div>}
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        We do not display pricing publicly. A tailored estimate will be prepared
        after review.
      </p>
    </form>
  );
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 1rem",
  background: "#111",
  border: "1px solid #222",
  color: "#fff",
  borderRadius: 2,
  fontSize: 14,
};
const fieldsetStyle: React.CSSProperties = {
  border: "1px solid #222",
  padding: "1rem",
  background: "#0b0b0b",
};
const serviceGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
  gap: "0.5rem",
  fontSize: 13,
};
const buttonStyle: React.CSSProperties = {
  background: "#fff",
  color: "#000",
  padding: "0.9rem 1.5rem",
  border: "none",
  fontWeight: 600,
  cursor: "pointer",
  letterSpacing: "0.05em",
};
const grid2: React.CSSProperties = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "1fr 1fr",
};
const grid3: React.CSSProperties = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
};
