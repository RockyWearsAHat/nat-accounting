import React, { useEffect, useState } from "react";
import { ConsultationForm } from "../sections/ConsultationForm";
import { WeeklyCalendar } from "../components/WeeklyCalendar";
import { LoginForm } from "../components/auth/LoginForm";
import { RegisterForm } from "../components/auth/RegisterForm";
import axios from "axios";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
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

// --------------------------------------
// Admin Panel
// --------------------------------------
const AdminPanel: React.FC<{ user: User; onLogout: () => void }> = ({
  user,
  onLogout,
}) => {
  const [consultations, setConsultations] = useState<any[] | null>(null);
  const [config, setConfig] = useState<{
    calendars: any[];
    whitelist: string[];
    busyEvents?: string[];
    colors?: Record<string, string>;
  } | null>(null);
  const [settings, setSettings] = useState<{
    timezone: string;
    businessName: string;
    businessHours: any;
  } | null>(null);
  const [availableTimezones, setAvailableTimezones] = useState<any[]>([]);
  const [weekEvents, setWeekEvents] = useState<any[] | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date>(
    getWeekStart(new Date())
  );
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<any[] | null>(
    null
  );
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [hours, setHours] = useState<null | {
    [day: string]: { raw: string; startMinutes: number; endMinutes: number };
  }>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // Helper function to get week start (Sunday)
  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  // Helper function to get week dates
  function getWeekDates(weekStart: Date): Date[] {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      return date;
    });
  }

  // Tick every minute for current time marker / ongoing highlights
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Data loaders
  const loadConsultations = async () => {
    try {
      const { data } = await axios.get("/api/consultations/admin");
      setConsultations(data.consultations || []);
    } catch {
      setConsultations([]);
    }
  };

  const loadConfig = async () => {
    try {
      console.log("[AdminPanel] Loading iCloud config...");
      const { data } = await axios.get("/api/icloud/config");
      console.log("[AdminPanel] Config loaded:", data);
      setConfig({
        calendars: data.calendars,
        whitelist: data.whitelist,
        busyEvents: data.busyEvents || [],
        colors: data.colors || {},
      });
    } catch (error) {
      console.error("[AdminPanel] Failed to load config:", error);
    }
  };

  const loadSettings = async () => {
    try {
      const { data } = await axios.get("/api/settings");
      setSettings(data.settings);
      console.log("[AdminPanel] Settings loaded:", data.settings);
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const loadTimezones = async () => {
    try {
      const { data } = await axios.get("/api/settings/timezones");
      setAvailableTimezones(data.timezones);
    } catch (error) {
      console.error("Failed to load timezones:", error);
    }
  };

  const updateTimezone = async (newTimezone: string) => {
    try {
      const { data } = await axios.post("/api/settings", {
        timezone: newTimezone,
      });
      setSettings(data.settings);
      // Reload events to show them in the new timezone
      loadWeek(selectedWeekStart);
    } catch (error) {
      console.error("Failed to update timezone:", error);
    }
  };

  const loadWeek = async (weekStart: Date) => {
    setLoadingWeek(true);
    setSelectedDay(null);
    try {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      // Format dates for API
      const startStr = weekStart.toISOString().split("T")[0];
      const endStr = weekEnd.toISOString().split("T")[0];

      console.log(`[AdminPanel] Loading week from ${startStr} to ${endStr}`);

      // Load events for the entire week
      const { data } = await axios.get(
        `/api/icloud/week?start=${startStr}&end=${endStr}`
      );
      console.log(
        `[AdminPanel] Week events loaded:`,
        data.events?.length || 0,
        "events"
      );
      setWeekEvents(data.events || []);
    } catch (error) {
      console.error("[AdminPanel] Failed to load week events:", error);
      setWeekEvents([]);
    } finally {
      setLoadingWeek(false);
    }
  };

  const loadHours = async () => {
    try {
      const { data } = await axios.get("/api/hours");
      if (data.ok) setHours(data.hours);
    } catch {
      console.error("Failed to load hours");
    }
  };

  const loadDay = async (date: Date) => {
    try {
      setSelectedDayEvents(null);
      const dateStr = date.toISOString().split("T")[0];
      const { data } = await axios.get(`/api/icloud/day?date=${dateStr}`);
      setSelectedDayEvents(data.events || []);
    } catch {
      setSelectedDayEvents([]);
    }
  };

  // Load initial data on mount with proper sequencing
  useEffect(() => {
    const initializeData = async () => {
      try {
        console.log("[AdminPanel] Starting data initialization...");
        await loadConsultations();
        await loadConfig();
        await loadSettings();
        await loadTimezones();
        await loadHours();
        console.log(
          "[AdminPanel] Initial config loaded, now loading week events..."
        );
        await loadWeek(selectedWeekStart);
        console.log("[AdminPanel] Initial data load complete");
      } catch (error) {
        console.error("[AdminPanel] Failed to initialize data:", error);
      }
    };
    initializeData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload week data when week changes
  useEffect(() => {
    if (config) {
      console.log("[AdminPanel] Week changed, reloading events...");
      loadWeek(selectedWeekStart);
    }
  }, [selectedWeekStart, config]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle handlers
  const toggleCalendarBusy = async (url: string) => {
    if (!config) return;
    const nextBusy = config.calendars.filter((c) => c.busy).map((c) => c.url);
    if (nextBusy.includes(url)) {
      const idx = nextBusy.indexOf(url);
      nextBusy.splice(idx, 1);
    } else nextBusy.push(url);
    const { data } = await axios.post("/api/icloud/config", {
      busy: nextBusy,
      colors: config.colors,
    });
    setConfig((c) =>
      c
        ? { ...c, calendars: data.calendars, colors: data.colors || c.colors }
        : c
    );
    loadWeek(selectedWeekStart);
  };

  const updateCalendarColor = async (url: string, color: string) => {
    if (!config) return;
    const colors = { ...(config.colors || {}), [url]: color };
    const busy = config.calendars.filter((c) => c.busy).map((c) => c.url);
    const { data } = await axios.post("/api/icloud/config", { busy, colors });
    setConfig((c) => (c ? { ...c, colors: data.colors || colors } : c));
    loadWeek(selectedWeekStart);
  };

  const toggleWhitelist = async (uid: string) => {
    if (!config) return;
    const is = config.whitelist.includes(uid);
    const { data } = await axios.post("/api/icloud/whitelist", {
      uid,
      action: is ? "remove" : "add",
    });
    setConfig((c) =>
      c
        ? {
            ...c,
            whitelist: data.whitelist,
            busyEvents: data.busyEvents || c.busyEvents,
          }
        : c
    );
    loadWeek(selectedWeekStart);
  };

  const toggleBusyEvent = async (uid: string) => {
    if (!config) return;
    const is = config.busyEvents?.includes(uid);
    const { data } = await axios.post("/api/icloud/event-busy", {
      uid,
      action: is ? "remove" : "add",
    });
    setConfig((c) =>
      c
        ? {
            ...c,
            busyEvents: data.busyEvents,
            whitelist: data.whitelist || c.whitelist,
          }
        : c
    );
    loadWeek(selectedWeekStart);
  };

  // Week navigation helpers
  const navigateWeek = (direction: "prev" | "next") => {
    const newWeekStart = new Date(selectedWeekStart);
    newWeekStart.setDate(
      selectedWeekStart.getDate() + (direction === "next" ? 7 : -7)
    );
    setSelectedWeekStart(newWeekStart);
  };

  const goToCurrentWeek = () => {
    setSelectedWeekStart(getWeekStart(new Date()));
  };

  const goToSpecificWeek = (
    year: number,
    month: number,
    weekNumber: number
  ) => {
    // Calculate the date for a specific week in a month
    const firstOfMonth = new Date(year, month - 1, 1);
    const firstWeekStart = getWeekStart(firstOfMonth);
    const targetWeekStart = new Date(firstWeekStart);
    targetWeekStart.setDate(firstWeekStart.getDate() + (weekNumber - 1) * 7);
    setSelectedWeekStart(targetWeekStart);
  };

  // Process events for weekly view
  const weekDates = getWeekDates(selectedWeekStart);
  const eventsByDay: Record<string, any[]> = {};

  console.log(
    "[AdminPanel] Processing weekly events:",
    weekEvents?.length || 0
  );
  if (weekEvents && weekEvents.length > 0) {
    console.log("[AdminPanel] Sample event:", weekEvents[0]);
    const sampleEventStart = new Date(weekEvents[0].start);
    console.log(
      "[AdminPanel] Sample event local time:",
      sampleEventStart.toLocaleString()
    );
    console.log(
      "[AdminPanel] Sample event UTC time:",
      sampleEventStart.toISOString()
    );
    console.log(
      "[AdminPanel] Sample event local hour:",
      sampleEventStart.getHours()
    );
  }

  (weekEvents || []).forEach((ev: any) => {
    const eventDate = new Date(ev.start);
    const dateKey = eventDate.toISOString().split("T")[0];
    if (!eventsByDay[dateKey]) eventsByDay[dateKey] = [];
    eventsByDay[dateKey].push(ev);
  });

  console.log(
    "[AdminPanel] Events by day:",
    Object.keys(eventsByDay).map((key) => `${key}: ${eventsByDay[key].length}`)
  );

  // Sort events by start time for each day
  Object.values(eventsByDay).forEach((dayEvents) =>
    dayEvents.sort((a, b) => a.start.localeCompare(b.start))
  );

  // Helper function to compute event lanes for visual layout
  function computeLanes(dayEvents: any[]) {
    const events = dayEvents.map((e) => {
      const start = new Date(e.start);
      const end = e.end
        ? new Date(e.end)
        : new Date(start.getTime() + 30 * 60000);
      return { ...e, _s: start, _e: end };
    });
    events.sort((a, b) => a._s.getTime() - b._s.getTime());
    const lanes: { end: number }[] = [];
    for (const ev of events) {
      let placed = false;
      for (let i = 0; i < lanes.length; i++) {
        if (ev._s.getTime() >= lanes[i].end) {
          (ev as any)._lane = i;
          lanes[i].end = ev._e.getTime();
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.push({ end: ev._e.getTime() });
        (ev as any)._lane = lanes.length - 1;
      }
    }
    return { events, laneCount: lanes.length };
  }

  const nowDate = new Date(nowTick);
  const currentWeekStart = getWeekStart(nowDate);
  const isCurrentWeek =
    selectedWeekStart.getTime() === currentWeekStart.getTime();

  // Render
  return (
    <div>
      <h2 style={{ fontWeight: 300 }}>Admin Dashboard</h2>
      <button onClick={onLogout} style={linkBtn}>
        Logout
      </button>
      {!consultations && <p>Loading consultations…</p>}
      {consultations && (
        <details open style={{ marginTop: "1rem" }}>
          <summary style={{ cursor: "pointer" }}>
            Consultations ({consultations.length})
          </summary>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "0.5rem 0",
              fontSize: 13,
            }}
          >
            {consultations.map((c: any) => (
              <li
                key={c.id}
                style={{ padding: "0.4rem 0", borderBottom: "1px solid #222" }}
              >
                <strong>{c.name}</strong> – {c.company} –{" "}
                {new Date(c.createdAt).toLocaleString()}
                <br />
                <span style={{ opacity: 0.7 }}>{c.email}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Weekly Calendar View */}
      <div style={{ marginTop: "2rem" }}>
        <WeeklyCalendar
          config={config as any}
          hours={hours}
          timezone={settings?.timezone}
          onConfigRefresh={() => {
            loadConfig();
          }}
        />
      </div>

      {/* Settings */}
      <div style={{ marginTop: "2rem" }}>
        <h3 style={{ fontWeight: 300 }}>Site Settings</h3>

        {/* Timezone Settings */}
        {settings && availableTimezones.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <strong style={{ fontSize: 14 }}>Timezone:</strong>
              <select
                value={settings.timezone}
                onChange={(e) => updateTimezone(e.target.value)}
                style={{
                  ...inputStyle,
                  width: "auto",
                  padding: "0.4rem 0.5rem",
                  fontSize: 12,
                }}
              >
                {availableTimezones.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: 11, color: "#888", margin: 0 }}>
              Current timezone: {settings.timezone} | Events and business hours
              will be displayed in this timezone.
            </p>
          </div>
        )}

        <h3 style={{ fontWeight: 300 }}>Calendar Settings</h3>
        {!config && <p style={{ fontSize: 12 }}>Loading config…</p>}
        {config && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 12,
            }}
          >
            <div>
              <strong>Busy Calendars</strong>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                {config.calendars.map((cal) => (
                  <div
                    key={cal.url}
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      border: "1px solid #222",
                      padding: "4px 6px",
                      borderRadius: 4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={cal.busy}
                      onChange={() => toggleCalendarBusy(cal.url)}
                      title="Toggle blocking/visibility"
                    />
                    <span style={{ minWidth: 80 }}>{cal.displayName}</span>
                    <input
                      type="color"
                      value={config.colors?.[cal.url] || "#ff3333"}
                      onChange={(e) =>
                        updateCalendarColor(cal.url, e.target.value)
                      }
                      style={{
                        width: 28,
                        height: 20,
                        cursor: "pointer",
                        background: "transparent",
                        border: "none",
                      }}
                      title="Set event color"
                    />
                    <span style={{ fontSize: 10, opacity: 0.6 }}>
                      {cal.busy ? "visible+blocking" : "hidden"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <strong>Whitelisted Event UIDs</strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {config.whitelist.map((uid) => (
                    <code
                      key={uid}
                      style={{
                        background: "#111",
                        padding: "2px 4px",
                        border: "1px solid #222",
                      }}
                    >
                      {uid}
                    </code>
                  ))}
                  {config.whitelist.length === 0 && (
                    <span style={{ opacity: 0.7 }}>None</span>
                  )}
                </div>
              </div>
              <div>
                <strong>Force-Busy Event UIDs</strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(config.busyEvents || []).map((uid) => (
                    <code
                      key={uid}
                      style={{
                        background: "#211",
                        padding: "2px 4px",
                        border: "1px solid #422",
                      }}
                    >
                      {uid}
                    </code>
                  ))}
                  {!config.busyEvents?.length && (
                    <span style={{ opacity: 0.7 }}>None</span>
                  )}
                </div>
              </div>
              <p style={{ opacity: 0.6, marginTop: 0 }}>
                Whitelist removes blocking. Force-Busy marks event as blocking
                even if its calendar is not blocking.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

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
}> = ({ user, children, onLogout }) => (
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
    <main
      style={{
        flex: 1,
        width: "100%",
        maxWidth: 900,
        margin: "0 auto",
        padding: "2rem",
      }}
    >
      {children}
    </main>
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

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  const logout = async () => {
    await axios.post("/api/auth/logout");
    setUser(null);
    navigate("/");
  };

  // Check authentication status on mount
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get("/api/auth/me");
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
