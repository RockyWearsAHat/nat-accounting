// Shared iCloud session/cache for use in both icloud.ts and calendar.ts
let _session = null;
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
