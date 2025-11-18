import React, { useEffect, useState } from "react";
import { ConsultationForm } from "../sections/ConsultationForm";
import { WeeklyCalendar } from "../components/WeeklyCalendar"; // still used on public pages if needed
import { AdminPanel } from "./AdminPanel";
import { ClientProfile } from "./ClientProfile";
import { LoginForm } from "../components/auth/LoginForm";
import { RegisterForm } from "../components/auth/RegisterForm";
import NewHome from "./NewHome";
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

const ClientRoute: React.FC<{
  user: User | null;
  children: React.ReactElement;
}> = ({ user, children }) => {
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const Home: React.FC = () => (
  <div style={{ position: "relative" }}>
    {/* Hero Section with Neobrutalism */}
    <section style={{ 
      marginBottom: "var(--space-4xl)",
      textAlign: "center",
      position: "relative"
    }}>
      {/* Abstract shape for visual interest */}
      <div style={{
        position: "absolute",
        top: -100,
        right: "10%",
        width: 300,
        height: 300,
        background: "var(--color-accent-purple)",
        opacity: 0.08,
        filter: "blur(80px)",
        borderRadius: "50%",
        pointerEvents: "none"
      }} />
      
      <h1 style={{ 
        fontFamily: "var(--font-display)",
        fontSize: "var(--font-size-6xl)",
        fontWeight: 900,
        letterSpacing: "var(--letter-spacing-tight)",
        marginBottom: "var(--space-lg)",
        lineHeight: "var(--line-height-tight)",
        textTransform: "uppercase"
      }}>
        <span style={{
          background: "linear-gradient(135deg, var(--color-accent-blue) 0%, var(--color-accent-purple) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text"
        }}>
          Professional
        </span>
        <br />
        <span style={{ color: "var(--color-text-primary)" }}>
          Accounting Services
        </span>
      </h1>
      
      <p style={{ 
        fontSize: "var(--font-size-xl)",
        color: "var(--color-text-secondary)",
        maxWidth: 700,
        margin: "0 auto var(--space-2xl)",
        lineHeight: "var(--line-height-relaxed)"
      }}>
        Expert financial guidance for businesses of all sizes. 
        From bookkeeping to strategic planning, we've got you covered.
      </p>
      
      {/* CTA Buttons */}
      <div style={{ 
        display: "flex", 
        gap: "var(--space-lg)", 
        justifyContent: "center",
        marginBottom: "var(--space-4xl)"
      }}>
        <a href="#consultation" style={{
          ...buttonStyle,
          textDecoration: "none",
          display: "inline-block"
        }}>
          Get Free Consultation
        </a>
        <button style={{
          ...buttonStyle,
          background: "transparent",
          color: "var(--color-accent-blue)",
          borderColor: "var(--color-accent-blue)",
          boxShadow: "3px 3px 0 var(--color-accent-blue)"
        }}>
          View Services
        </button>
      </div>
    </section>
    
    {/* Services Grid */}
    <section style={{ 
      marginBottom: "var(--space-4xl)",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      gap: "var(--space-xl)"
    }}>
      {[
        { title: "Bookkeeping", icon: "📊", desc: "Monthly financial record management" },
        { title: "Tax Planning", icon: "💰", desc: "Strategic tax optimization" },
        { title: "Advisory", icon: "🎯", desc: "Financial guidance & consulting" },
        { title: "Payroll", icon: "💼", desc: "Complete payroll processing" }
      ].map((service, i) => (
        <div key={i} style={{
          background: "var(--color-bg-tertiary)",
          border: "var(--border-width-thick) solid var(--border-color-primary)",
          padding: "var(--space-xl)",
          borderRadius: "var(--radius-brutal)",
          boxShadow: "5px 5px 0 var(--border-color-primary)",
          transition: "all var(--transition-fast)",
          cursor: "pointer"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translate(-3px, -3px)";
          e.currentTarget.style.boxShadow = "8px 8px 0 var(--border-color-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translate(0, 0)";
          e.currentTarget.style.boxShadow = "5px 5px 0 var(--border-color-primary)";
        }}>
          <div style={{ 
            fontSize: "var(--font-size-5xl)",
            marginBottom: "var(--space-md)"
          }}>
            {service.icon}
          </div>
          <h3 style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--font-size-xl)",
            fontWeight: "var(--font-weight-bold)",
            marginBottom: "var(--space-sm)",
            color: "var(--color-text-primary)"
          }}>
            {service.title}
          </h3>
          <p style={{
            color: "var(--color-text-secondary)",
            fontSize: "var(--font-size-sm)",
            lineHeight: "var(--line-height-relaxed)"
          }}>
            {service.desc}
          </p>
        </div>
      ))}
    </section>
    
    {/* Consultation Form Section */}
    <section id="consultation" style={{ 
      marginBottom: "var(--space-3xl)",
      maxWidth: 800,
      margin: "0 auto"
    }}>
      <div style={{
        background: "var(--glass-bg-strong)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        border: "var(--border-width-thick) solid var(--border-color-primary)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-2xl)",
        boxShadow: "var(--shadow-brutal-lg)"
      }}>
        <h2 style={{ 
          fontFamily: "var(--font-display)",
          fontSize: "var(--font-size-4xl)",
          fontWeight: "var(--font-weight-bold)",
          marginBottom: "var(--space-md)",
          background: "linear-gradient(135deg, var(--color-accent-blue) 0%, var(--color-accent-purple) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text"
        }}>
          Free Consultation
        </h2>
        <p style={{ 
          fontSize: "var(--font-size-lg)",
          color: "var(--color-text-secondary)",
          marginBottom: "var(--space-2xl)",
          lineHeight: "var(--line-height-relaxed)"
        }}>
          Tell us about your needs. We'll review and schedule a call during business hours.
        </p>
        <ConsultationForm />
      </div>
    </section>
  </div>
);

const Layout: React.FC<{
  user: User | null;
  children: React.ReactNode;
  onLogout: () => void;
}> = ({ user, children, onLogout }) => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const mainMaxWidth = isAdminRoute ? undefined : 1200;
  const mainStyle: React.CSSProperties = isAdminRoute
    ? {
        flex: 1,
        width: "100%",
        margin: "0 auto",
        padding: "var(--space-2xl) 0 var(--space-3xl)",
        display: "flex",
        justifyContent: "center",
      }
    : {
        flex: 1,
        width: "100%",
        maxWidth: mainMaxWidth,
        margin: "0 auto",
        padding: "var(--space-2xl) var(--space-xl)",
      };
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", position: "relative" }}>
      {/* Header with neobrutalism style */}
      <header style={{ 
        padding: "var(--space-xl) var(--space-2xl)", 
        borderBottom: "var(--border-width-thick) solid var(--border-color-primary)",
        background: "var(--color-bg-secondary)",
        position: "relative",
        zIndex: 10
      }}>
        <div style={{ 
          maxWidth: 1400, 
          margin: "0 auto", 
          display: "flex", 
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-xs)" }}>
              <h1 style={{ 
                margin: 0, 
                fontFamily: "var(--font-display)", 
                fontWeight: 900, 
                fontSize: "var(--font-size-3xl)",
                background: "linear-gradient(135deg, var(--color-accent-blue) 0%, var(--color-accent-purple) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                textTransform: "uppercase",
                letterSpacing: "0.02em"
              }}>
                LUMINA
              </h1>
              <span style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-text-secondary)",
                fontWeight: "var(--font-weight-normal)"
              }}>
                Financial Group
              </span>
            </div>
          </Link>
          
          {/* Navigation */}
          <nav style={{
            display: "flex",
            gap: "var(--space-lg)",
            alignItems: "center",
            fontSize: "var(--font-size-sm)",
            fontWeight: "var(--font-weight-medium)"
          }}>
            <Link to="/" style={navLink}>
              Home
            </Link>
            {!user && (
              <>
                <span style={{ color: "var(--color-text-tertiary)" }}>|</span>
                <Link to="/login" style={navLink}>
                  Login
                </Link>
              </>
            )}
            {user && (
              <>
                <span style={{ 
                  color: "var(--color-text-secondary)",
                  fontSize: "var(--font-size-xs)",
                  padding: "var(--space-xs) var(--space-md)",
                  background: "var(--color-bg-tertiary)",
                  border: "var(--border-width-thin) solid var(--border-color-subtle)",
                  borderRadius: "var(--radius-full)"
                }}>
                  {user.email} <span style={{ color: "var(--color-accent-blue)" }}>({user.role})</span>
                </span>
                {user.role === "admin" && (
                  <>
                    <span style={{ color: "var(--color-text-tertiary)" }}>|</span>
                    <Link to="/admin" style={navLink}>
                      Admin
                    </Link>
                  </>
                )}
                {user.role === "user" && (
                  <>
                    <span style={{ color: "var(--color-text-tertiary)" }}>|</span>
                    <Link to="/profile" style={navLink}>
                      My Profile
                    </Link>
                  </>
                )}
                <button onClick={onLogout} style={logoutBtn}>
                  Logout
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      
      <main style={mainStyle}>{children}</main>
      
      {/* Footer with neobrutalism */}
      <footer style={{
        padding: "var(--space-2xl)",
        borderTop: "var(--border-width-thick) solid var(--border-color-primary)",
        fontSize: "var(--font-size-sm)",
        textAlign: "center",
        background: "var(--color-bg-secondary)",
        color: "var(--color-text-secondary)",
        position: "relative",
        zIndex: 10
      }}>
        <p style={{ margin: 0 }}>
          © {new Date().getFullYear()} Lumina Financial Group. All rights reserved.
        </p>
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
        element={<NewHome />}
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
      <Route
        path="/profile"
        element={
          <Layout user={user} onLogout={logout}>
            <ClientRoute user={user}>
              <ClientProfile />
            </ClientRoute>
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
  color: "var(--color-text-primary)",
  textDecoration: "none",
  fontWeight: 500,
  transition: "color var(--transition-fast)",
  position: "relative",
  padding: "var(--space-sm) 0",
};

const logoutBtn: React.CSSProperties = {
  background: "var(--color-accent-red)",
  border: "var(--border-width-medium) solid var(--color-text-primary)",
  color: "var(--color-text-primary)",
  padding: "var(--space-sm) var(--space-lg)",
  cursor: "pointer",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-bold)",
  textTransform: "uppercase",
  letterSpacing: "var(--letter-spacing-wide)",
  borderRadius: "var(--radius-brutal)",
  boxShadow: "3px 3px 0 var(--color-text-primary)",
  transition: "all var(--transition-fast)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--space-md)",
  background: "var(--color-bg-tertiary)",
  border: "var(--border-width-medium) solid var(--border-color-subtle)",
  color: "var(--color-text-primary)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--font-size-base)",
  fontFamily: "var(--font-sans)",
};

const buttonStyle: React.CSSProperties = {
  background: "var(--color-accent-blue)",
  color: "var(--color-text-inverse)",
  padding: "var(--space-md) var(--space-xl)",
  border: "var(--border-width-thick) solid var(--color-text-primary)",
  fontWeight: "var(--font-weight-bold)",
  cursor: "pointer",
  letterSpacing: "var(--letter-spacing-wide)",
  fontSize: "var(--font-size-base)",
  textTransform: "uppercase",
  borderRadius: "var(--radius-brutal)",
  boxShadow: "var(--shadow-brutal-md)",
  transition: "all var(--transition-fast)",
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
