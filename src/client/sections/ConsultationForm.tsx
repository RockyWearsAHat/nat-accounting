import React, { useState } from "react";
import { http } from "../lib/http";

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
  const data = await http.post<any>("/api/consultations", form);
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
      style={{ display: "grid", gap: "var(--space-lg)", width: "100%" }}
    >
      {/* Basic Info Section */}
      <div>
        <h3 style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--font-size-xl)",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-text-primary)",
          marginBottom: "var(--space-md)",
          textTransform: "uppercase",
          letterSpacing: "var(--letter-spacing-wide)"
        }}>
          Contact Information
        </h3>
        <div style={grid2}>
          {text("name", "text", "Full Name *")}
          {text("email", "email", "Email Address *")}
        </div>
        <div style={grid2}>
          {text("phone", "text", "Phone Number *")}
          {text("company", "text", "Company Name *")}
        </div>
        {text("website", "text", "Website (optional)")}
      </div>
      
      {/* Business Details Section */}
      <div>
        <h3 style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--font-size-xl)",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-text-primary)",
          marginBottom: "var(--space-md)",
          textTransform: "uppercase",
          letterSpacing: "var(--letter-spacing-wide)"
        }}>
          Business Details
        </h3>
        <div style={grid2}>
          {text("dunsNumber", "text", "DUNS Number (optional)")}
          {text("numberOfSubsidiaries", "number", "Number of Subsidiaries")}
        </div>
        <div style={grid3}>
          {text("revenueApprox", "number", "Approx. Revenue (USD)")}
          {text("transactionsPerMonth", "number", "Transactions / Month")}
          {text("reconciliationAccounts", "number", "Accounts to Reconcile")}
        </div>
      </div>
      
      {/* Goals/Notes */}
      <div>
        <label style={{
          display: "block",
          fontWeight: "var(--font-weight-medium)",
          fontSize: "var(--font-size-sm)",
          color: "var(--color-text-secondary)",
          marginBottom: "var(--space-sm)",
          textTransform: "uppercase",
          letterSpacing: "var(--letter-spacing-wide)"
        }}>
          Goals & Notes
        </label>
        <textarea
          placeholder="Tell us about your goals and specific needs..."
          value={form.goals || ""}
          onChange={(e) => update({ goals: e.target.value })}
          style={{ ...inputStyle, minHeight: 120, resize: "vertical", fontFamily: "var(--font-sans)" }}
        />
      </div>
      
      {/* Services Section */}
      <fieldset style={fieldsetStyle}>
        <legend style={{ 
          padding: "0 var(--space-md)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--font-size-xl)",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-text-primary)",
          textTransform: "uppercase",
          letterSpacing: "var(--letter-spacing-wide)"
        }}>
          Requested Services
        </legend>
        <div style={serviceGrid}>
          {[
            { key: "wantsBookkeeping", label: "📊 Bookkeeping" },
            { key: "wantsReconciliations", label: "✅ Reconciliations" },
            { key: "wantsFinancials", label: "📈 Financial Statements" },
            { key: "wantsSoftwareImplementation", label: "💻 Software Setup" },
            { key: "wantsAdvisory", label: "🎯 Advisory Services" },
            { key: "wantsAR", label: "💳 Accounts Receivable" },
            { key: "wantsAP", label: "💰 Accounts Payable" },
            { key: "wantsForecasting", label: "🔮 Cash Flow Forecasting" },
            { key: "wantsCleanup", label: "🧹 Financial Clean-Up" },
            { key: "wantsWebsiteHelp", label: "🌐 Website Assistance" }
          ].map(service => (
            <label key={service.key} style={checkboxLabel}>
              <input 
                type="checkbox" 
                {...cb(service.key as keyof FormState)} 
                style={checkboxStyle}
              />
              <span>{service.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      
      {/* Submit Button */}
      <button 
        disabled={submitting} 
        style={{
          ...buttonStyle,
          opacity: submitting ? 0.6 : 1,
          cursor: submitting ? "not-allowed" : "pointer"
        }}
        onMouseEnter={(e) => {
          if (!submitting) {
            (e.target as HTMLButtonElement).style.transform = "translate(-3px, -3px)";
            (e.target as HTMLButtonElement).style.boxShadow = "8px 8px 0 var(--color-text-primary)";
          }
        }}
        onMouseLeave={(e) => {
          if (!submitting) {
            (e.target as HTMLButtonElement).style.transform = "translate(0, 0)";
            (e.target as HTMLButtonElement).style.boxShadow = "5px 5px 0 var(--color-text-primary)";
          }
        }}
      >
        {submitting ? "SUBMITTING..." : "SUBMIT CONSULTATION REQUEST"}
      </button>
      
      {/* Status Message */}
      {status && (
        <div style={{ 
          padding: "var(--space-md)",
          background: status.includes("Submitted") 
            ? "var(--color-success)" 
            : "var(--color-error)",
          color: "var(--color-text-inverse)",
          border: "var(--border-width-medium) solid var(--color-text-primary)",
          borderRadius: "var(--radius-sm)",
          fontWeight: "var(--font-weight-bold)",
          textAlign: "center"
        }}>
          {status}
        </div>
      )}
      
      {/* Disclaimer */}
      <p style={{ 
        fontSize: "var(--font-size-sm)", 
        color: "var(--color-text-tertiary)",
        textAlign: "center",
        fontStyle: "italic",
        lineHeight: "var(--line-height-relaxed)"
      }}>
        💡 Pricing is customized based on your specific needs. 
        A tailored estimate will be prepared after our initial consultation.
      </p>
    </form>
  );
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--space-md)",
  background: "var(--color-bg-tertiary)",
  border: "var(--border-width-medium) solid var(--border-color-subtle)",
  color: "var(--color-text-primary)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--font-size-base)",
  transition: "all var(--transition-fast)",
  outline: "none",
};

const fieldsetStyle: React.CSSProperties = {
  border: "var(--border-width-thick) solid var(--border-color-primary)",
  padding: "var(--space-xl)",
  background: "var(--color-bg-elevated)",
  borderRadius: "var(--radius-sm)",
  boxShadow: "3px 3px 0 var(--border-color-primary)",
};

const serviceGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: "var(--space-md)",
  marginTop: "var(--space-lg)"
};

const checkboxLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-sm)",
  fontSize: "var(--font-size-sm)",
  color: "var(--color-text-secondary)",
  cursor: "pointer",
  padding: "var(--space-sm)",
  background: "var(--color-bg-tertiary)",
  border: "var(--border-width-thin) solid var(--border-color-subtle)",
  borderRadius: "var(--radius-sm)",
  transition: "all var(--transition-fast)",
};

const checkboxStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  cursor: "pointer",
  accentColor: "var(--color-accent-blue)"
};

const buttonStyle: React.CSSProperties = {
  background: "var(--color-accent-blue)",
  color: "var(--color-text-inverse)",
  padding: "var(--space-lg) var(--space-2xl)",
  border: "var(--border-width-thick) solid var(--color-text-primary)",
  fontFamily: "var(--font-display)",
  fontWeight: "var(--font-weight-bold)",
  fontSize: "var(--font-size-base)",
  cursor: "pointer",
  letterSpacing: "var(--letter-spacing-wider)",
  textTransform: "uppercase",
  borderRadius: "var(--radius-brutal)",
  boxShadow: "5px 5px 0 var(--color-text-primary)",
  transition: "all var(--transition-fast)",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-lg)",
  gridTemplateColumns: "1fr 1fr",
  marginTop: "var(--space-md)"
};

const grid3: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-lg)",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  marginTop: "var(--space-md)"
};
