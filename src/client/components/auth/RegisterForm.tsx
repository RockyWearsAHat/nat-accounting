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
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const data = await http.post<any>("/api/auth/register", {
        email,
        password,
        company: company || undefined,
        website: website || undefined,
      });
      if (data.id) {
        const loginData = await http.post<any>("/api/auth/login", {
          email,
          password,
        });
        if (loginData.ok) {
          onAuth(loginData.user);
          navigate("/");
        }
      } else setError("Registration failed");
    } catch (err: any) {
      setError(err.data?.error || "Registration failed");
    }
  };

  return (
    <form onSubmit={submit} className={styles.container}>
      <h2 className={styles.title}>Register</h2>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className={styles.input}
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        placeholder="Password (min 8 chars)"
        className={styles.input}
      />
      <input
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        placeholder="Company (optional)"
        className={styles.input}
      />
      <input
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        placeholder="Website (optional)"
        className={styles.input}
      />
      <button className={styles.button}>Create Account</button>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.helper}>
        Have an account?{" "}
        <Link to="/login" className={styles.link}>
          Login
        </Link>
      </div>
    </form>
  );
};
