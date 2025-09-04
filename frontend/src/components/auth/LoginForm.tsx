import React, { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import styles from "./LoginForm.module.css";

interface User {
  email: string;
  role: string;
}
interface Props {
  onAuth: (u: User) => void;
}

export const LoginForm: React.FC<Props> = ({ onAuth }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { data } = await axios.post("/api/auth/login", { email, password });
      if (data.ok) {
        onAuth(data.user);
        navigate(data.user.role === "admin" ? "/admin" : "/");
      } else setError("Login failed");
    } catch (err: any) {
      setError(err.response?.data?.error || "Login failed");
    }
  };

  return (
    <form onSubmit={submit} className={styles.container}>
      <h2 className={styles.title}>Login</h2>
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
        placeholder="Password"
        className={styles.input}
      />
      <button className={styles.button}>Login</button>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.helper}>
        No account?{" "}
        <Link to="/register" className={styles.link}>
          Register
        </Link>
      </div>
    </form>
  );
};
