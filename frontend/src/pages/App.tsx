import React, { useEffect, useState } from "react";
import { ConsultationForm } from "../sections/ConsultationForm";
import { WeeklyCalendar } from "../components/WeeklyCalendar"; // still used on public pages if needed
import { AdminPanel } from "./AdminPanel";
import { LoginForm } from "../components/auth/LoginForm";
import { RegisterForm } from "../components/auth/RegisterForm";
import { http } from "../lib/http";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";

interface User {
  email: string;
  role: string;
}

// Utility function to format date/time in a specific timezone
function formatInTimezone(
  date: Date,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    ...options,
  }).format(date);
}

// Convert UTC time to local time in specified timezone
function convertToTimezone(utcDate: Date, timezone: string): Date {
  // Create a new date representing the same moment in the target timezone
  const utcTime = utcDate.getTime();
  const targetTime = new Date(utcTime);

  // Get timezone offset
  const utcString = utcDate.toISOString();
  const targetString = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(utcDate);

  return new Date(targetString.replace(" ", "T"));
}

// AdminPanel moved to its own file ./AdminPanel

// (Removed large inline DayEventsModal; replaced by dedicated component file previously)

// --------------------------------------
// Auth & Public Pages
// --------------------------------------
// (LoginPage & RegisterPage now externalized as components)

const ProtectedRoute: React.FC<{
  user: User | null;
  children: React.ReactElement;
}> = ({ user, children }) => {
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return children;
};

const Home: React.FC = () => (
  <section style={{ marginBottom: "3rem" }}>
    <h2 style={{ fontWeight: 300 }}>Free Consultation</h2>
    <p style={{ maxWidth: 600, lineHeight: 1.5 }}>
      Tell us about your needs. We will review and follow up to schedule a call
      within business hours.
    </p>
    <ConsultationForm />
  </section>
);

const Layout: React.FC<{
  user: User | null;
  children: React.ReactNode;
  onLogout: () => void;
}> = ({ user, children, onLogout }) => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const mainMaxWidth = isAdminRoute ? undefined : 900;
  const mainStyle: React.CSSProperties = isAdminRoute
    ? {
        flex: 1,
        width: "100%",
        margin: "0 auto",
        padding: "2rem 0 3rem",
        display: "flex",
        justifyContent: "center",
      }
    : {
        flex: 1,
        width: "100%",
        maxWidth: mainMaxWidth,
        margin: "0 auto",
        padding: "2rem",
      };
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header style={{ padding: "2rem", borderBottom: "1px solid #222" }}>
        <h1 style={{ margin: 0, fontWeight: 400, letterSpacing: "0.05em" }}>
          NAT'S ACCOUNTING
        </h1>
      </header>
      <nav
        style={{
          position: "absolute",
          top: 12,
          right: 16,
          fontSize: 12,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <Link to="/" style={navLink}>
          Home
        </Link>
        {!user && (
          <>
            <span>| </span>
            <Link to="/login" style={navLink}>
              Login
            </Link>
          </>
        )}
        {user && (
          <>
            <span style={{ opacity: 0.6 }}>
              {user.email} ({user.role})
            </span>
            {user.role === "admin" && (
              <>
                <span>| </span>
                <Link to="/admin" style={navLink}>
                  Admin
                </Link>
              </>
            )}
            <span>| </span>
            <button onClick={onLogout} style={linkBtn}>
              Logout
            </button>
          </>
        )}
      </nav>
      <main style={mainStyle}>{children}</main>
      <footer
        style={{
          padding: "2rem",
          borderTop: "1px solid #222",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        © {new Date().getFullYear()} Nat's Accounting. All rights reserved.
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  const logout = async () => {
  await http.post("/api/auth/logout");
    setUser(null);
    navigate("/");
  };

  // Check authentication status on mount
  useEffect(() => {
    (async () => {
      try {
  const data = await http.get<any>("/api/auth/me");
  if (data.user) setUser(data.user);
      } catch {}
    })();
  }, []);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout user={user} onLogout={logout}>
            <Home />
          </Layout>
        }
      />
      <Route
        path="/login"
        element={
          <Layout user={user} onLogout={logout}>
            <LoginForm onAuth={(u) => setUser(u)} />
          </Layout>
        }
      />
      <Route
        path="/register"
        element={
          <Layout user={user} onLogout={logout}>
            <RegisterForm onAuth={(u) => setUser(u)} />
          </Layout>
        }
      />
      <Route
        path="/admin"
        element={
          <Layout user={user} onLogout={logout}>
            <ProtectedRoute user={user}>
              <AdminPanel user={user as User} onLogout={logout} />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export const AppWithRouter: React.FC = () => (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

// Styles -------------------------------------------------
const navLink: React.CSSProperties = {
  color: "#fff",
  textDecoration: "none",
  opacity: 0.8,
};
const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #333",
  color: "#fff",
  padding: "0.4rem 0.75rem",
  cursor: "pointer",
  fontSize: 12,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  background: "#111",
  border: "1px solid #222",
  color: "#fff",
  borderRadius: 2,
  fontSize: 13,
};
const buttonStyle: React.CSSProperties = {
  background: "#fff",
  color: "#000",
  padding: "0.6rem 0.9rem",
  border: "none",
  fontWeight: 600,
  cursor: "pointer",
  letterSpacing: "0.05em",
  fontSize: 13,
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Utility to darken/lighten a hex color by percent (-100 to 100)
function shadeColor(hex: string, percent: number) {
  try {
    hex = hex.replace("#", "");
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    if (hex.length !== 6) return hex;
    const num = parseInt(hex, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    r = Math.min(255, Math.max(0, r + (percent / 100) * 255));
    g = Math.min(255, Math.max(0, g + (percent / 100) * 255));
    b = Math.min(255, Math.max(0, b + (percent / 100) * 255));
    return `#${(
      (1 << 24) +
      (Math.round(r) << 16) +
      (Math.round(g) << 8) +
      Math.round(b)
    )
      .toString(16)
      .slice(1)}`;
  } catch {
    return hex;
  }
}
