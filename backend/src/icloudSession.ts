// Shared iCloud session/cache for use in both icloud.ts and calendar.ts

export interface ICloudSession {
  appleId: string;
  appPassword: string;
  calendarHref?: string;
}

let _session: ICloudSession | null = null;
let _calendarsCache: any[] = [];

export function getSession() {
  return _session;
}
export function setSession(s: ICloudSession | null) {
  _session = s;
}
export function getCalendarsCache() {
  return _calendarsCache;
}
export function setCalendarsCache(c: any[]) {
  _calendarsCache = c;
}
