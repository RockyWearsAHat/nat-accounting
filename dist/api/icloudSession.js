// Shared iCloud session/cache for use in both icloud.ts and calendar.ts
let _session = null;
let _calendarsCache = [];
export function getSession() {
    console.log('[icloudSession] getSession:', _session);
    return _session;
}
export function setSession(s) {
    console.log('[icloudSession] setSession:', s);
    _session = s;
}
export function getCalendarsCache() {
    console.log('[icloudSession] getCalendarsCache:', _calendarsCache);
    return _calendarsCache;
}
export function setCalendarsCache(c) {
    console.log('[icloudSession] setCalendarsCache:', c);
    _calendarsCache = c;
}
