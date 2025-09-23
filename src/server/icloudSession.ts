// Shared iCloud session/cache for use in both icloud.ts and calendar.ts

export interface ICloudSession {
  appleId: string;
  appPassword: string;
  calendarHref?: string;
}

let _session: ICloudSession | null = null;
let _calendarsCache: any[] = [];

export function getSession() {
  console.log('[icloudSession] getSession:', _session);
  return _session;
}
export function setSession(s: ICloudSession | null) {
  console.log('[icloudSession] setSession:', s);
  _session = s;
}
export function getCalendarsCache() {
  console.log('[icloudSession] getCalendarsCache:', _calendarsCache);
  return _calendarsCache;
}
export function setCalendarsCache(c: any[]) {
  console.log('[icloudSession] setCalendarsCache:', c);
  _calendarsCache = c;
}
