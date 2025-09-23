import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { google } from "googleapis";
import { User } from "../models/User";
import { getCachedEvents, setCachedEvents, createCacheKey } from "../cache";
import { connect as connectMongo, CalendarConfigModel } from "../mongo";
const router = Router();
router.use(requireAuth);
function requireAdmin(req, res, next) {
    if (req.user?.role !== "admin")
        return res.status(403).json({ error: "forbidden" });
    next();
}
// Start OAuth
router.get("/auth/url", requireAdmin, async (_req, res) => {
    const client = buildClient();
    const url = client.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/calendar.readonly"],
        prompt: "consent",
        include_granted_scopes: true,
    });
    res.json({ url });
});
// OAuth callback stores tokens on the logged-in admin user
router.post("/auth/callback", requireAdmin, async (req, res) => {
    const { code } = req.body || {};
    if (!code)
        return res.status(400).json({ error: "code_required" });
    const client = buildClient();
    try {
        const { tokens } = await client.getToken(code);
        console.log("[google] POST callback token keys:", Object.keys(tokens || {}), "hasRefresh=", !!tokens.refresh_token);
        const user = await User.findById(req.user.id);
        if (!user)
            return res.status(404).json({ error: "user_not_found" });
        const existing = user.get("googleTokens") || {};
        if (tokens.refresh_token)
            existing.refreshToken = tokens.refresh_token;
        // Do NOT persist access token (ephemeral); force removal if previously stored
        if (existing.accessToken)
            delete existing.accessToken;
        if (tokens.expiry_date)
            existing.expiryDate = new Date(tokens.expiry_date);
        if (tokens.scope)
            existing.scope = tokens.scope;
        if (tokens.token_type)
            existing.tokenType = tokens.token_type;
        existing.updatedAt = new Date();
        user.set("googleTokens", existing);
        await user.save();
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[google] token exchange failed", e);
        res.status(500).json({ error: "token_exchange_failed" });
    }
});
// Support standard OAuth redirect (Google sends GET request with code)
router.get("/auth/callback", requireAdmin, async (req, res) => {
    const code = String(req.query.code || "").trim();
    if (!code)
        return res.status(400).send("Missing code");
    const client = buildClient();
    try {
        const { tokens } = await client.getToken(code);
        console.log("[google] GET callback token keys:", Object.keys(tokens || {}), "hasRefresh=", !!tokens.refresh_token);
        const user = await User.findById(req.user.id);
        if (!user)
            return res.status(404).send("User not found");
        const existing = user.get("googleTokens") || {};
        if (tokens.refresh_token)
            existing.refreshToken = tokens.refresh_token;
        if (existing.accessToken)
            delete existing.accessToken;
        if (tokens.expiry_date)
            existing.expiryDate = new Date(tokens.expiry_date);
        if (tokens.scope)
            existing.scope = tokens.scope;
        if (tokens.token_type)
            existing.tokenType = tokens.token_type;
        existing.updatedAt = new Date();
        user.set("googleTokens", existing);
        await user.save();
        console.log("[google] OAuth callback stored tokens (has refresh=", !!existing.refreshToken, ")");
        // Redirect back to frontend admin panel (best-effort)
        const redirect = process.env.FRONTEND_BASE_URL || "/";
        res.redirect(redirect);
    }
    catch (e) {
        console.error("[google] GET callback token exchange failed", e?.message || e);
        res.status(500).send("Token exchange failed");
    }
});
router.get("/status", requireAdmin, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user?.googleTokens?.refreshToken)
        return res.json({ connected: false });
    res.json({
        connected: true,
        scope: user.googleTokens.scope,
        expires: user.googleTokens.expiryDate,
        updatedAt: user.googleTokens.updatedAt,
    });
});
router.get("/calendars", requireAdmin, async (req, res) => {
    try {
        const client = await getAuthorizedClient(req.user.id);
        if (!client)
            return res.status(400).json({ error: "not_authenticated" });
        const calendar = google.calendar({ version: "v3", auth: client });
        const list = await calendar.calendarList.list({ maxResults: 250 });
        const calendars = (list.data.items || []).map((c) => ({
            id: c.id,
            summary: c.summary,
            primary: !!c.primary,
            accessRole: c.accessRole,
            backgroundColor: c.backgroundColor,
            foregroundColor: c.foregroundColor,
            url: `google://${c.id}`,
        }));
        res.json({ calendars });
    }
    catch (e) {
        console.error("[google] calendars list failed", e?.message || e);
        res.status(500).json({ error: "google_calendars_failed" });
    }
});
async function getAuthorizedClient(userId) {
    const user = await User.findById(userId);
    if (!user?.googleTokens?.refreshToken)
        return null;
    const client = buildClient();
    const creds = {
        refresh_token: user.googleTokens.refreshToken,
    };
    if (user.googleTokens.scope)
        creds.scope = user.googleTokens.scope;
    client.setCredentials(creds);
    return client;
}
function buildClient() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
        throw new Error("Missing Google OAuth env vars");
    }
    return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}
// Fetch primary calendar events for the week (extend later for multi-calendar)
router.get("/week", requireAdmin, async (req, res) => {
    const startStr = String(req.query.start || "").trim();
    const endStr = String(req.query.end || "").trim();
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(startStr) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(endStr)) {
        return res.status(400).json({ error: "invalid_start_or_end_date" });
    }
    const [sy, sm, sd] = startStr.split("-").map((n) => parseInt(n, 10));
    const [ey, em, ed] = endStr.split("-").map((n) => parseInt(n, 10));
    const from = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    const to = new Date(ey, em - 1, ed, 23, 59, 59, 999);
    const cacheKey = createCacheKey("google", "week", startStr, endStr, req.user.id);
    const cached = await getCachedEvents(cacheKey);
    if (cached)
        return res.json({ range: { start: from.toISOString(), end: to.toISOString() }, events: cached, cached: true });
    const client = await getAuthorizedClient(req.user.id);
    if (!client) {
        console.warn("[google] week request without authorized client (no tokens)");
        return res.status(400).json({ error: "not_authenticated" });
    }
    const calendar = google.calendar({ version: "v3", auth: client });
    try {
        // Determine which Google calendars are marked busy in unified config (CalendarConfigModel)
        await connectMongo();
        const configDoc = await CalendarConfigModel.findOne();
        const busyCalendars = configDoc ? configDoc.busyCalendars || [] : [];
        // If no config yet, we'll fallback later
        const calListResp = await calendar.calendarList.list({ maxResults: 250 });
        const allGoogleCals = (calListResp.data.items || []).map((c) => c.id).filter(Boolean);
        let targetGoogleCals = allGoogleCals.map(id => `google://${id}`);
        if (busyCalendars.length) {
            targetGoogleCals = targetGoogleCals.filter(u => busyCalendars.includes(u));
        }
        if (!targetGoogleCals.length)
            targetGoogleCals = allGoogleCals.map(id => `google://${id}`);
        const events = [];
        for (const calUrl of targetGoogleCals) {
            const calId = calUrl.replace(/^google:\/\//, "");
            try {
                const resp = await calendar.events.list({
                    calendarId: calId,
                    timeMin: from.toISOString(),
                    timeMax: to.toISOString(),
                    singleEvents: true,
                    orderBy: "startTime",
                    maxResults: 500,
                });
                for (const e of resp.data.items || []) {
                    const start = e.start?.dateTime || (e.start?.date ? e.start.date + "T00:00:00Z" : undefined);
                    const end = e.end?.dateTime || (e.end?.date ? e.end.date + "T23:59:00Z" : undefined);
                    if (!start)
                        continue;
                    events.push({
                        summary: e.summary || "(No Title)",
                        start,
                        end,
                        uid: e.id,
                        calendar: (calListResp.data.items || []).find(ci => ci.id === calId)?.summary || calId,
                        calendarUrl: `google://${calId}`,
                        calendarId: calId,
                        calendarSource: 'google',
                        blocking: busyCalendars.length ? busyCalendars.includes(`google://${calId}`) : true,
                        color: undefined,
                    });
                }
            }
            catch (inner) {
                console.warn("[google] calendar events fetch failed", calId, inner?.message || inner);
            }
        }
        await setCachedEvents(cacheKey, events, 300);
        res.json({ range: { start: from.toISOString(), end: to.toISOString() }, events, cached: false });
    }
    catch (e) {
        console.error("[google] events fetch failed", e?.message || e);
        res.status(500).json({ error: "google_events_failed" });
    }
});
export { router };
