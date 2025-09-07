import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AdminUser } from "../models/AdminUser.js";
import { ClientUser } from "../models/ClientUser.js";
const router = Router();
const baseRegisterSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});
// Admin registration (optionally disabled via env)
router.post("/admin/register", async (req, res) => {
    if (process.env.ALLOW_ADMIN_REG === "false")
        return res.status(403).json({ error: "disabled" });
    const parsed = baseRegisterSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { email, password } = parsed.data;
    const existing = await AdminUser.findOne({ email });
    if (existing)
        return res.status(409).json({ error: "exists" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await AdminUser.create({ email, passwordHash });
    res.status(201).json({ id: user._id.toString(), email: user.email, role: user.role });
});
// Client registration
const clientRegisterSchema = baseRegisterSchema.extend({
    company: z.string().min(1).optional(),
    website: z.string().url().optional(),
});
router.post("/register", async (req, res) => {
    const parsed = clientRegisterSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { email, password, company, website } = parsed.data;
    const existing = await ClientUser.findOne({ email });
    if (existing)
        return res.status(409).json({ error: "exists" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await ClientUser.create({ email, passwordHash, company, website });
    res.status(201).json({ id: user._id.toString(), email: user.email, role: user.role });
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
    // Try admin first, then client
    let user = await AdminUser.findOne({ email });
    if (!user)
        user = await ClientUser.findOne({ email });
    if (!user)
        return res.status(401).json({ error: "invalid_credentials" });
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match)
        return res.status(401).json({ error: "invalid_credentials" });
    const payload = { id: user._id.toString(), email: user.email, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "devsecret", { expiresIn: "8h" });
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: false });
    res.json({ ok: true, user: payload });
});
// Session restore
router.get("/me", async (req, res) => {
    const token = req.cookies?.token;
    if (!token)
        return res.json({ user: null });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "devsecret");
        res.json({ user: { id: decoded.id, email: decoded.email, role: decoded.role } });
    }
    catch {
        res.json({ user: null });
    }
});
router.post("/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ ok: true });
});
export default router;
