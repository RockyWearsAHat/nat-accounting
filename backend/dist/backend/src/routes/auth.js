import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AdminUser } from "../models/AdminUser.js";
const router = Router();
const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});
router.post("/register", async (req, res) => {
    if (process.env.ALLOW_ADMIN_REG === "false")
        return res.status(403).json({ error: "disabled" });
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { email, password } = parsed.data;
    const existing = await AdminUser.findOne({ email });
    if (existing)
        return res.status(409).json({ error: "exists" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await AdminUser.create({ email, passwordHash });
    res.status(201).json({ id: user._id.toString(), email: user.email });
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
    const user = await AdminUser.findOne({ email });
    if (!user)
        return res.status(401).json({ error: "invalid_credentials" });
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match)
        return res.status(401).json({ error: "invalid_credentials" });
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
router.post("/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ ok: true });
});
export default router;
