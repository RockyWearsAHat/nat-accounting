import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

const router = Router();

function getCookieDomainFromHost(hostname: string | undefined): string | undefined {
  if (!hostname) return undefined;
  const host = hostname.split(":")[0];

  // For localhost and its subdomains, do NOT set domain (host-only cookies work better in browsers)
  // This is a known browser security limitation with .localhost domains
  if (host === "localhost" || host.endsWith(".localhost") || /\d+\.\d+\.\d+\.\d+/.test(host)) {
    return undefined;
  }

  // For production domains (e.g., mayrconsultingservices.com), set domain for cross-subdomain sharing
  // This allows admin.domain.com and client.domain.com to share the same cookie
  const parts = host.split(".").filter(Boolean);
  if (parts.length >= 2) {
    const base = parts.slice(-2).join(".");
    return `.${base}`;
  }
  return undefined;
}

const baseRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// NOTE: Admin self-registration removed for security. Seed first admin via env vars.

// User (non-admin) registration
const clientRegisterSchema = baseRegisterSchema.extend({
  company: z.string().min(1).optional(),
  website: z.string().url().optional(),
});
router.post("/register", async (req, res) => {
  const parsed = clientRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    // Return both flattened errors and a user-friendly message
    const flattened = parsed.error.flatten();
    const firstError = Object.values(flattened.fieldErrors)[0]?.[0] || flattened.formErrors[0] || "Validation failed";
    return res.status(400).json({
      error: flattened,
      message: firstError
    });
  }
  const { email, password, company, website } = parsed.data;
  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: "exists", message: "Email already registered" });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash, company, website });
  res
    .status(201)
    .json({ id: user._id.toString(), email: user.email, role: user.role });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  // Find user by email
  const user: any = await User.findOne({ email });
  const passwordField = 'passwordHash';

  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const match = await bcrypt.compare(password, user[passwordField]);
  if (!match) return res.status(401).json({ error: "invalid_credentials" });

  const payload = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET || "devsecret", {
    expiresIn: "8h",
  });
  const cookieDomain = getCookieDomainFromHost(req.headers.host);
  const isProduction = process.env.NODE_ENV === "production";
  console.log('[Auth] Setting cookie - Host:', req.headers.host, 'Domain:', cookieDomain, 'SameSite:', isProduction ? 'none' : 'lax', 'Secure:', isProduction);
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    domain: cookieDomain,
  });
  res.json({ ok: true, user: payload });
});

// Session restore
router.get("/me", async (req, res) => {
  const token = req.cookies?.token;
  console.log('[Auth] /me endpoint - Host:', req.headers.host, 'Has token:', !!token, 'All cookies:', Object.keys(req.cookies || {}));
  if (!token) return res.json({ user: null });
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "devsecret"
    ) as any;
    console.log('[Auth] /me endpoint - Token verified, user:', decoded.email);
    res.json({
      user: { id: decoded.id, email: decoded.email, role: decoded.role },
    });
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      console.log('[Auth] Token expired, clearing cookie');
      res.clearCookie('token', { domain: getCookieDomainFromHost(req.headers.host) });
    } else {
      console.log('[Auth] /me endpoint - Token verification failed:', error);
    }
    res.json({ user: null });
  }
});

router.post("/logout", (req, res) => {
  const cookieDomain = getCookieDomainFromHost(req.headers.host);
  res.clearCookie("token", { domain: cookieDomain });
  res.json({ ok: true });
});



export { router };
