import React, { useState } from "react";
import { http } from "../../lib/http";
import { Link, useNavigate } from "react-router-dom";
import styles from "./RegisterForm.module.css";

interface User {
  email: string;
  role: string;
}
interface Props {
  onAuth: (u: User) => void;
}

export const RegisterForm: React.FC<Props> = ({ onAuth }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    
    try {
      const data = await http.post<any>("/api/auth/register", {
        email,
        password,
        company: company || undefined,
        website: website || undefined,
      });
      
      if (data.id) {
        // Registration successful, now auto-login
        try {
          const loginData = await http.post<any>("/api/auth/login", {
            email,
            password,
          });
          if (loginData.ok) {
            onAuth(loginData.user);
            navigate("/");
          } else {
            setError("Registration successful, but login failed. Please try logging in manually.");
          }
        } catch (loginErr) {
          setError("Registration successful, but login failed. Please try logging in manually.");
        }
      } else {
        setError("Registration failed - no user ID returned");
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      
      // Extract error information safely
      const errorData = err?.data;
      
      // Try to get user-friendly message first
      if (errorData?.message && typeof errorData.message === 'string') {
        setError(errorData.message);
      } 
      // Handle field-specific validation errors
      else if (errorData?.error?.fieldErrors && typeof errorData.error.fieldErrors === 'object') {
        const fields = errorData.error.fieldErrors;
        const errors: Record<string, string> = {};
        
        // Extract first error for each field
        for (const [field, messages] of Object.entries(fields)) {
          if (Array.isArray(messages) && messages.length > 0) {
            errors[field] = messages[0];
          }
        }
        
        setFieldErrors(errors);
        setError("Please fix the validation errors below");
      }
      // Handle form-level errors
      else if (errorData?.error?.formErrors && Array.isArray(errorData.error.formErrors) && errorData.error.formErrors.length > 0) {
        setError(errorData.error.formErrors[0]);
      }
      // Handle simple string errors
      else if (typeof errorData?.error === 'string') {
        setError(errorData.error === 'exists' ? 'Email already registered' : errorData.error);
      }
      // Generic fallback
      else {
        setError("Registration failed. Please check your information and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className={styles.container}>
      <h2 className={styles.title}>Register</h2>
      
      {error && <div className={styles.error}>{error}</div>}
      
      <div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={styles.input}
          disabled={loading}
        />
        {fieldErrors.email && <div className={styles.fieldError}>{fieldErrors.email}</div>}
      </div>
      
      <div>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Password (min 8 chars)"
          className={styles.input}
          disabled={loading}
        />
        {fieldErrors.password && <div className={styles.fieldError}>{fieldErrors.password}</div>}
      </div>
      
      <div>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company (optional)"
          className={styles.input}
          disabled={loading}
        />
        {fieldErrors.company && <div className={styles.fieldError}>{fieldErrors.company}</div>}
      </div>
      
      <div>
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="Website (optional)"
          className={styles.input}
          disabled={loading}
        />
        {fieldErrors.website && <div className={styles.fieldError}>{fieldErrors.website}</div>}
      </div>
      
      <button className={styles.button} disabled={loading}>
        {loading ? "Creating Account..." : "Create Account"}
      </button>
      
      <div className={styles.helper}>
        Have an account?{" "}
        <Link to="/login" className={styles.link}>
          Login
        </Link>
      </div>
    </form>
  );
};
