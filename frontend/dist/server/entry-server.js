import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import axios from "axios";
import { BrowserRouter, useNavigate, Routes, Route, Navigate, Link } from "react-router-dom";
import { renderToString } from "react-dom/server";
const initial = { name: "", email: "", phone: "", company: "" };
const ConsultationForm = () => {
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const update = (patch) => setForm((f) => ({ ...f, ...patch }));
  const submit = async (e) => {
    var _a, _b;
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const { data } = await axios.post("/api/consultations", form);
      if (data.ok) {
        setStatus("Submitted. We will reach out soon.");
        setForm(initial);
      } else setStatus("Submission failed.");
    } catch (err) {
      setStatus(
        ((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) ? "Validation issue – please review fields." : "Network error"
      );
    } finally {
      setSubmitting(false);
    }
  };
  const cb = (k) => ({
    checked: Boolean(form[k]),
    onChange: (e) => update({ [k]: e.target.checked })
  });
  const text = (k, type = "text", placeholder) => /* @__PURE__ */ jsx(
    "input",
    {
      required: ["name", "email", "phone", "company"].includes(k),
      type,
      placeholder,
      value: form[k] || "",
      onChange: (e) => update({
        [k]: type === "number" ? Number(e.target.value) : e.target.value
      }),
      style: inputStyle$1
    }
  );
  return /* @__PURE__ */ jsxs(
    "form",
    {
      onSubmit: submit,
      style: { display: "grid", gap: "1rem", maxWidth: 800 },
      children: [
        /* @__PURE__ */ jsxs("div", { style: grid2, children: [
          text("name", "text", "Name"),
          text("email", "email", "Email")
        ] }),
        /* @__PURE__ */ jsxs("div", { style: grid2, children: [
          text("phone", "text", "Phone"),
          text("company", "text", "Company")
        ] }),
        text("website", "text", "Website (optional)"),
        /* @__PURE__ */ jsxs("div", { style: grid2, children: [
          text("dunsNumber", "text", "DUNS Number (optional)"),
          text("numberOfSubsidiaries", "number", "# Subsidiaries")
        ] }),
        /* @__PURE__ */ jsxs("div", { style: grid3, children: [
          text("revenueApprox", "number", "Revenue (USD)"),
          text("transactionsPerMonth", "number", "Transactions / month"),
          text("reconciliationAccounts", "number", "# Accounts to Reconcile")
        ] }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            placeholder: "Goals / Notes",
            value: form.goals || "",
            onChange: (e) => update({ goals: e.target.value }),
            style: { ...inputStyle$1, minHeight: 120, resize: "vertical" }
          }
        ),
        /* @__PURE__ */ jsxs("fieldset", { style: fieldsetStyle, children: [
          /* @__PURE__ */ jsx("legend", { style: { padding: "0 0.5rem" }, children: "Requested Services" }),
          /* @__PURE__ */ jsxs("div", { style: serviceGrid, children: [
            /* @__PURE__ */ jsxs("label", { children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", ...cb("wantsBookkeeping") }),
              " Bookkeeping"
            ] }),
            /* @__PURE__ */ jsxs("label", { children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", ...cb("wantsReconciliations") }),
              " ",
              "Reconciliations"
            ] }),
            /* @__PURE__ */ jsxs("label", { children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", ...cb("wantsFinancials") }),
              " Financial Statements"
            ] }),
            /* @__PURE__ */ jsxs("label", { children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", ...cb("wantsSoftwareImplementation") }),
              " ",
              "Software Implementation"
            ] }),
            /* @__PURE__ */ jsxs("label", { children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", ...cb("wantsAdvisory") }),
              " Advisory"
            ] }),
            /* @__PURE__ */ jsxs("label", { children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", ...cb("wantsAR") }),
              " Accounts Receivable"
            ] }),
            /* @__PURE__ */ jsxs("label", { children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", ...cb("wantsAP") }),
              " Accounts Payable"
            ] }),
            /* @__PURE__ */ jsxs("label", { children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", ...cb("wantsForecasting") }),
              " Forecasting"
            ] }),
            /* @__PURE__ */ jsxs("label", { children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", ...cb("wantsCleanup") }),
              " Financial Clean-Up"
            ] }),
            /* @__PURE__ */ jsxs("label", { children: [
              /* @__PURE__ */ jsx("input", { type: "checkbox", ...cb("wantsWebsiteHelp") }),
              " Website Help"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx("button", { disabled: submitting, style: buttonStyle$1, children: submitting ? "Submitting..." : "Submit Consultation" }),
        status && /* @__PURE__ */ jsx("div", { style: { fontSize: 14 }, children: status }),
        /* @__PURE__ */ jsx("p", { style: { fontSize: 12, opacity: 0.7 }, children: "We do not display pricing publicly. A tailored estimate will be prepared after review." })
      ]
    }
  );
};
const inputStyle$1 = {
  width: "100%",
  padding: "0.75rem 1rem",
  background: "#111",
  border: "1px solid #222",
  color: "#fff",
  borderRadius: 2,
  fontSize: 14
};
const fieldsetStyle = {
  border: "1px solid #222",
  padding: "1rem",
  background: "#0b0b0b"
};
const serviceGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
  gap: "0.5rem",
  fontSize: 13
};
const buttonStyle$1 = {
  background: "#fff",
  color: "#000",
  padding: "0.9rem 1.5rem",
  border: "none",
  fontWeight: 600,
  cursor: "pointer",
  letterSpacing: "0.05em"
};
const grid2 = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "1fr 1fr"
};
const grid3 = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))"
};
const AdminPanel = ({ user, onLogout }) => {
  const [list, setList] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get("/api/consultations/admin");
        setList(data);
      } catch {
        setList({ error: true });
      }
    })();
  }, []);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("h2", { style: { fontWeight: 300 }, children: "Admin Dashboard" }),
    /* @__PURE__ */ jsx("button", { onClick: onLogout, style: linkBtn, children: "Logout" }),
    !list && /* @__PURE__ */ jsx("p", { children: "Loading..." }),
    list && list.error && /* @__PURE__ */ jsx("p", { children: "Error loading consultations." }),
    list && list.consultations && /* @__PURE__ */ jsx("ul", { style: { listStyle: "none", padding: 0, margin: "1rem 0", fontSize: 13 }, children: list.consultations.map((c) => /* @__PURE__ */ jsxs("li", { style: { padding: "0.5rem 0", borderBottom: "1px solid #222" }, children: [
      /* @__PURE__ */ jsx("strong", { children: c.name }),
      " – ",
      c.company,
      " – ",
      new Date(c.createdAt).toLocaleString(),
      /* @__PURE__ */ jsx("br", {}),
      /* @__PURE__ */ jsx("span", { style: { opacity: 0.8 }, children: c.email })
    ] }, c.id)) })
  ] });
};
const LoginPage = ({ onAuth }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const submit = async (e) => {
    var _a, _b;
    e.preventDefault();
    setError(null);
    try {
      const { data } = await axios.post("/api/auth/login", { email, password });
      if (data.ok) {
        onAuth(data.user);
        navigate("/admin");
      } else setError("Login failed");
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) || "Login failed");
    }
  };
  const register = async (e) => {
    var _a, _b;
    e.preventDefault();
    setError(null);
    try {
      const { data } = await axios.post("/api/auth/register", { email, password });
      if (data.id) {
        await submit(e);
      } else setError("Registration failed");
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) || "Registration failed");
    }
  };
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "3rem", flexWrap: "wrap" }, children: [
    /* @__PURE__ */ jsxs("form", { onSubmit: submit, style: { display: "grid", gap: "0.75rem", maxWidth: 320 }, children: [
      /* @__PURE__ */ jsx("h2", { style: { fontWeight: 300, margin: "0 0 0.5rem" }, children: "Login" }),
      /* @__PURE__ */ jsx("input", { value: email, onChange: (e) => setEmail(e.target.value), placeholder: "Email", style: inputStyle }),
      /* @__PURE__ */ jsx("input", { value: password, onChange: (e) => setPassword(e.target.value), type: "password", placeholder: "Password", style: inputStyle }),
      /* @__PURE__ */ jsx("button", { style: buttonStyle, children: "Login" }),
      error && /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "#f66" }, children: error })
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: register, style: { display: "grid", gap: "0.75rem", maxWidth: 320 }, children: [
      /* @__PURE__ */ jsx("h2", { style: { fontWeight: 300, margin: "0 0 0.5rem" }, children: "Register" }),
      /* @__PURE__ */ jsx("input", { value: email, onChange: (e) => setEmail(e.target.value), placeholder: "Email", style: inputStyle }),
      /* @__PURE__ */ jsx("input", { value: password, onChange: (e) => setPassword(e.target.value), type: "password", placeholder: "Password", style: inputStyle }),
      /* @__PURE__ */ jsx("button", { style: buttonStyle, children: "Register" })
    ] })
  ] });
};
const ProtectedRoute = ({ user, children }) => {
  if (!user) return /* @__PURE__ */ jsx(Navigate, { to: "/login", replace: true });
  if (user.role !== "admin") return /* @__PURE__ */ jsx(Navigate, { to: "/", replace: true });
  return children;
};
const Home = () => /* @__PURE__ */ jsxs("section", { style: { marginBottom: "3rem" }, children: [
  /* @__PURE__ */ jsx("h2", { style: { fontWeight: 300 }, children: "Free Consultation" }),
  /* @__PURE__ */ jsx("p", { style: { maxWidth: 600, lineHeight: 1.5 }, children: "Tell us about your needs. We will review and follow up to schedule a call within business hours." }),
  /* @__PURE__ */ jsx(ConsultationForm, {})
] });
const Layout = ({ user, children, onLogout }) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", minHeight: "100vh" }, children: [
  /* @__PURE__ */ jsx("header", { style: { padding: "2rem", borderBottom: "1px solid #222" }, children: /* @__PURE__ */ jsx("h1", { style: { margin: 0, fontWeight: 400, letterSpacing: "0.05em" }, children: "NAT'S ACCOUNTING" }) }),
  /* @__PURE__ */ jsxs("nav", { style: { position: "absolute", top: 12, right: 16, fontSize: 12 }, children: [
    /* @__PURE__ */ jsx(Link, { to: "/", style: navLink, children: "Home" }),
    !user && /* @__PURE__ */ jsxs(Fragment, { children: [
      " ",
      /* @__PURE__ */ jsx("span", { children: "| " }),
      /* @__PURE__ */ jsx(Link, { to: "/login", style: navLink, children: "Login" })
    ] }),
    user && user.role === "admin" && /* @__PURE__ */ jsxs(Fragment, { children: [
      " ",
      /* @__PURE__ */ jsx("span", { children: "| " }),
      /* @__PURE__ */ jsx(Link, { to: "/admin", style: navLink, children: "Admin" }),
      " ",
      /* @__PURE__ */ jsx("span", { children: "| " }),
      /* @__PURE__ */ jsx("button", { onClick: onLogout, style: linkBtn, children: "Logout" })
    ] })
  ] }),
  /* @__PURE__ */ jsx("main", { style: { flex: 1, width: "100%", maxWidth: 900, margin: "0 auto", padding: "2rem" }, children }),
  /* @__PURE__ */ jsxs("footer", { style: { padding: "2rem", borderTop: "1px solid #222", fontSize: 12, textAlign: "center" }, children: [
    "© ",
    (/* @__PURE__ */ new Date()).getFullYear(),
    " Nat's Accounting. All rights reserved."
  ] })
] });
const App = () => {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const logout = async () => {
    await axios.post("/api/auth/logout");
    setUser(null);
    navigate("/");
  };
  return /* @__PURE__ */ jsxs(Routes, { children: [
    /* @__PURE__ */ jsx(Route, { path: "/", element: /* @__PURE__ */ jsx(Layout, { user, onLogout: logout, children: /* @__PURE__ */ jsx(Home, {}) }) }),
    /* @__PURE__ */ jsx(Route, { path: "/login", element: /* @__PURE__ */ jsx(Layout, { user, onLogout: logout, children: /* @__PURE__ */ jsx(LoginPage, { onAuth: (u) => setUser(u) }) }) }),
    /* @__PURE__ */ jsx(Route, { path: "/admin", element: /* @__PURE__ */ jsx(Layout, { user, onLogout: logout, children: /* @__PURE__ */ jsx(ProtectedRoute, { user, children: /* @__PURE__ */ jsx(AdminPanel, { user, onLogout: logout }) }) }) }),
    /* @__PURE__ */ jsx(Route, { path: "*", element: /* @__PURE__ */ jsx(Navigate, { to: "/", replace: true }) })
  ] });
};
const AppWithRouter = () => /* @__PURE__ */ jsx(BrowserRouter, { children: /* @__PURE__ */ jsx(App, {}) });
const navLink = { color: "#fff", textDecoration: "none", opacity: 0.8 };
const linkBtn = {
  background: "transparent",
  border: "1px solid #333",
  color: "#fff",
  padding: "0.4rem 0.75rem",
  cursor: "pointer",
  fontSize: 12
};
const inputStyle = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  background: "#111",
  border: "1px solid #222",
  color: "#fff",
  borderRadius: 2,
  fontSize: 13
};
const buttonStyle = {
  background: "#fff",
  color: "#000",
  padding: "0.6rem 0.9rem",
  border: "none",
  fontWeight: 600,
  cursor: "pointer",
  letterSpacing: "0.05em",
  fontSize: 13
};
async function render(_url) {
  const html = renderToString(/* @__PURE__ */ jsx(AppWithRouter, {}));
  const head = "";
  return { html, head };
}
export {
  render
};
