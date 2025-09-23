import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

const router = Router();

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
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, company, website } = parsed.data;
  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: "exists" });
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
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });
  res.json({ ok: true, user: payload });
});

// Session restore
router.get("/me", async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.json({ user: null });
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "devsecret"
    ) as any;
    res.json({
      user: { id: decoded.id, email: decoded.email, role: decoded.role },
    });
  } catch {
    res.json({ user: null });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});



export { router };
