import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { google } from "googleapis";
import { User } from "../models/User";
import { getCachedEvents, setCachedEvents, createCacheKey } from "../cache";
import { connect as connectMongo } from "../mongo";
import { CalendarConfigModel } from "../models/CalendarConfig";

const router = Router();
router.use(requireAuth);

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}

// Start OAuth
router.get("/auth/url", requireAdmin, async (_req, res) => {
  const client = buildClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.readonly"],
  prompt: "consent",
  include_granted_scopes: true as any,
  });
  res.json({ url });
});

// OAuth callback stores tokens on the logged-in admin user
router.post("/auth/callback", requireAdmin, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "code_required" });
  const client = buildClient();
  try {
  const { tokens } = await client.getToken(code);
  console.log("[google] POST callback token keys:", Object.keys(tokens||{}), "hasRefresh=", !!tokens.refresh_token);
  const user = await User.findById((req as any).user!.id);
    if (!user) return res.status(404).json({ error: "user_not_found" });
    const existing: any = user.get("googleTokens") || {};
  if (tokens.refresh_token) existing.refreshToken = tokens.refresh_token;
  // Do NOT persist access token (ephemeral); force removal if previously stored
  if (existing.accessToken) delete existing.accessToken;
    if (tokens.expiry_date) existing.expiryDate = new Date(tokens.expiry_date);
    if (tokens.scope) existing.scope = tokens.scope;
    if (tokens.token_type) existing.tokenType = tokens.token_type;
    existing.updatedAt = new Date();
    user.set("googleTokens", existing);
    await user.save();
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[google] token exchange failed", e);
    res.status(500).json({ error: "token_exchange_failed" });
  }
});

// Support standard OAuth redirect (Google sends GET request with code)
router.get("/auth/callback", requireAdmin, async (req, res) => {
  const code = String((req.query as any).code || "").trim();
  if (!code) return res.status(400).send("Missing code");
  const client = buildClient();
  try {
  const { tokens } = await client.getToken(code);
  console.log("[google] GET callback token keys:", Object.keys(tokens||{}), "hasRefresh=", !!tokens.refresh_token);
    const user = await User.findById((req as any).user!.id);
    if (!user) return res.status(404).send("User not found");
    const existing: any = user.get("googleTokens") || {};
  if (tokens.refresh_token) existing.refreshToken = tokens.refresh_token;
  if (existing.accessToken) delete existing.accessToken;
    if (tokens.expiry_date) existing.expiryDate = new Date(tokens.expiry_date);
    if (tokens.scope) existing.scope = tokens.scope;
    if (tokens.token_type) existing.tokenType = tokens.token_type;
    existing.updatedAt = new Date();
    user.set("googleTokens", existing);
    await user.save();
    console.log("[google] OAuth callback stored tokens (has refresh=", !!existing.refreshToken, ")");
    // Redirect back to frontend admin panel (best-effort)
    const redirect = process.env.FRONTEND_BASE_URL || "/";
    res.redirect(redirect);
  } catch (e: any) {
    console.error("[google] GET callback token exchange failed", e?.message || e);
    res.status(500).send("Token exchange failed");
  }
});

router.get("/status", requireAdmin, async (req, res) => {
  const user = await User.findById((req as any).user!.id);
  if (!user?.googleTokens?.refreshToken) return res.json({ connected: false });
  res.json({
    connected: true,
    scope: user.googleTokens.scope,
    expires: user.googleTokens.expiryDate,
    updatedAt: user.googleTokens.updatedAt,
  });
});

router.get("/calendars", requireAdmin, async (req, res) => {
  try {
  const client = await getAuthorizedClient((req as any).user!.id);
    if (!client) return res.status(400).json({ error: "not_authenticated" });
    const calendar = google.calendar({ version: "v3", auth: client });
    const list = await calendar.calendarList.list({ maxResults: 250 });
    const calendars = (list.data.items || []).map((c: any) => ({
      id: c.id,
      summary: c.summary,
      primary: !!c.primary,
      accessRole: c.accessRole,
      backgroundColor: c.backgroundColor,
      foregroundColor: c.foregroundColor,
      url: `google://${c.id}`,
    }));
    res.json({ calendars });
  } catch (e: any) {
    console.error("[google] calendars list failed", e?.message || e);
    res.status(500).json({ error: "google_calendars_failed" });
  }
});

export async function getAuthorizedClient(userId?: string) {
  const user = await User.findById(userId);
  if (!user?.googleTokens?.refreshToken) {
    console.log("[google] No refresh token found for user:", userId);
    return null;
  }
  
  const client = buildClient();
  const creds: any = {
    refresh_token: user.googleTokens.refreshToken,
  };
  if (user.googleTokens.scope) creds.scope = user.googleTokens.scope;
  
  client.setCredentials(creds);
  
  // Set up token refresh event handler
  client.on('tokens', async (tokens) => {
    console.log("[google] Tokens refreshed, updating user tokens");
    if (tokens.access_token) {
      // Update the client credentials with the new access token
      client.setCredentials({
        ...client.credentials,
        access_token: tokens.access_token,
      });
    }
    // Note: We don't persist access tokens, only refresh tokens
  });
  
  try {
    // Force a token refresh to ensure we have a valid access token
    await client.getAccessToken();
    console.log("[google] Successfully refreshed access token for user:", userId);
  } catch (error) {
    console.error("[google] Failed to refresh access token:", error);
    return null;
  }
  
  return client;
}

function buildClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error("Missing Google OAuth env vars");
  }
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
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

  const cacheKey = createCacheKey("google", "week", startStr, endStr, (req as any).user!.id);
  const cached = await getCachedEvents(cacheKey);
  if (cached) return res.json({ range: { start: from.toISOString(), end: to.toISOString() }, events: cached, cached: true });

  const client = await getAuthorizedClient((req as any).user!.id);
  if (!client) {
    console.warn("[google] week request without authorized client (no tokens)");
    return res.status(400).json({ error: "not_authenticated" });
  }
  const calendar = google.calendar({ version: "v3", auth: client });
  try {
    // Determine which Google calendars are marked busy in unified config (CalendarConfigModel)
    await connectMongo();
    const configDoc: any = await CalendarConfigModel.findOne();
    const busyCalendars: string[] = configDoc ? configDoc.busyCalendars || [] : [];
    // If no config yet, we'll fallback later
    const calListResp = await calendar.calendarList.list({ maxResults: 250 });
    const allGoogleCals = (calListResp.data.items || []).map((c:any)=> c.id).filter(Boolean);
    let targetGoogleCals = allGoogleCals.map(id=> `google://${id}`);
    if (busyCalendars.length) {
      targetGoogleCals = targetGoogleCals.filter(u=> busyCalendars.includes(u));
    }
    // BUG FIX: Don't revert to all calendars if none are in busy list
    // This was causing all Google calendars to be processed even when not configured as busy
    // if (!targetGoogleCals.length) targetGoogleCals = allGoogleCals.map(id=> `google://${id}`);

    const events: any[] = [];
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
          if (!start) continue;
          const calendarInfo = (calListResp.data.items || []).find(ci=> ci.id===calId);
          events.push({
            summary: e.summary || "(No Title)",
            start,
            end,
            uid: e.id,
            calendar: calendarInfo?.summary || calId,
            calendarUrl: `google://${calId}`,
            calendarId: calId,
            calendarSource: 'google',
            sourceTimezone: calendarInfo?.timeZone || 'America/Denver', // Default to Mountain Time
            blocking: busyCalendars.length ? busyCalendars.includes(`google://${calId}`) : true,
            color: configDoc?.calendarColors?.[`google://${calId}`] || '#4285f4',
          });
        }
      } catch (inner: any) {
        console.warn("[google] calendar events fetch failed", calId, inner?.message || inner);
      }
    }
    await setCachedEvents(cacheKey, events, 300);
    res.json({ range: { start: from.toISOString(), end: to.toISOString() }, events, cached: false });
  } catch (e: any) {
    console.error("[google] events fetch failed", e?.message || e);
    res.status(500).json({ error: "google_events_failed" });
  }
});

router.get("/all", requireAdmin, async (req, res) => {
  const cacheKey = createCacheKey("google", "all", (req as any).user!.id);
  const cached = await getCachedEvents(cacheKey);
  if (cached) {
    res.json({ events: cached, cached: true });
    return;
  }

  const client = await getAuthorizedClient((req as any).user!.id);
  if (!client) {
    console.warn("[google] all request without authorized client (no tokens)");
    res.status(400).json({ error: "not_authenticated" });
    return;
  }
  const calendar = google.calendar({ version: "v3", auth: client });
  try {
    // Determine which Google calendars are marked busy in unified config (CalendarConfigModel)
    await connectMongo();
    const configDoc: any = await CalendarConfigModel.findOne();
    const busyCalendars: string[] = configDoc ? configDoc.busyCalendars || [] : [];
    console.log(`[Google] /all DEBUG: busyCalendars.length = ${busyCalendars.length}, busyCalendars =`, busyCalendars);
    
    // If no config yet, we'll fallback later
    const calListResp = await calendar.calendarList.list({ maxResults: 250 });
    const allGoogleCals = (calListResp.data.items || []).map((c:any)=> c.id).filter(Boolean);
    let targetGoogleCals = allGoogleCals.map(id=> `google://${id}`);
    console.log(`[Google] /all DEBUG: Initial targetGoogleCals =`, targetGoogleCals);
    
    if (busyCalendars.length) {
      targetGoogleCals = targetGoogleCals.filter(u=> busyCalendars.includes(u));
      console.log(`[Google] /all DEBUG: After filtering, targetGoogleCals =`, targetGoogleCals);
    }
    
    // BUG FIX: Don't revert to all calendars if none are in busy list
    // This was causing all Google calendars to be processed even when not configured as busy
    // if (!targetGoogleCals.length) targetGoogleCals = allGoogleCals.map(id=> `google://${id}`);

    const events: any[] = [];
    for (const calUrl of targetGoogleCals) {
      const calId = calUrl.replace(/^google:\/\//, "");
      try {
        // For /all endpoint, fetch events from 1 year ago to 2 years from now
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const twoYearsFromNow = new Date();
        twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
        
        const resp = await calendar.events.list({
          calendarId: calId,
          timeMin: oneYearAgo.toISOString(),
          timeMax: twoYearsFromNow.toISOString(),
          singleEvents: false, // Keep recurring events as base events with recurrence rules
          // Note: orderBy is not supported when singleEvents=false
          maxResults: 2500, // Should be much fewer events now
        });
        for (const e of resp.data.items || []) {
          const start = e.start?.dateTime || (e.start?.date ? e.start.date + "T00:00:00Z" : undefined);
          const end = e.end?.dateTime || (e.end?.date ? e.end.date + "T23:59:00Z" : undefined);
          if (!start) continue;
          const calendarInfo = (calListResp.data.items || []).find(ci=> ci.id===calId);
          
          const eventData: any = {
            summary: e.summary || "(No Title)",
            start,
            end,
            uid: e.id,
            calendar: calendarInfo?.summary || calId,
            calendarUrl: `google://${calId}`,
            calendarId: calId,
            calendarSource: 'google',
            sourceTimezone: calendarInfo?.timeZone || 'America/Denver', // Default to Mountain Time
            blocking: busyCalendars.length ? busyCalendars.includes(`google://${calId}`) : true,
            color: configDoc?.calendarColors?.[`google://${calId}`] || '#4285f4',
            isRecurring: !!e.recurrence,
          };
          
          // Include recurrence rules for recurring events
          if (e.recurrence && e.recurrence.length > 0) {
            eventData.recurrence = e.recurrence;
          }
          
          events.push(eventData);
        }
      } catch (inner: any) {
        console.warn("[google] calendar events fetch failed", calId, inner?.message || inner);
      }
    }
    await setCachedEvents(cacheKey, events, 3600); // Cache for 1 hour for /all endpoint
    res.json({ events, cached: false });
    return;
  } catch (e: any) {
    console.error("[google] events fetch failed", e?.message || e);
    res.status(500).json({ error: "google_events_failed" });
    return;
  }
});

export { router };