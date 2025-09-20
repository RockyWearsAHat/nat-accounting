// Shared iCloud session/cache for use in both icloud.ts and calendar.ts
let _session = null;
// Auto-initialize session from .env if available
if (!_session && process.env.ICLOUD_APPLE_ID && process.env.ICLOUD_APP_PASSWORD) {
    _session = {
        appleId: process.env.ICLOUD_APPLE_ID,
        appPassword: process.env.ICLOUD_APP_PASSWORD,
    };
}
let _calendarsCache = [];
export function getSession() {
    return _session;
}
export function setSession(s) {
    _session = s;
}
export function getCalendarsCache() {
    return _calendarsCache;
}
export function setCalendarsCache(c) {
    _calendarsCache = c;
}
