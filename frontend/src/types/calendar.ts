export interface CalendarEvent {
  summary: string;
  start: string;
  end?: string;
  uid?: string;
  calendar: string;
  calendarUrl: string;
  blocking?: boolean; 
  color?: string;
  status?: string;
  responseStatus?: string;
}

export interface CalendarInfo {
  displayName: string;
  url: string;
  busy: boolean;
}

export interface CalendarConfig {
  calendars: CalendarInfo[];
  whitelist: string[];
  busyEvents?: string[];
  colors?: Record<string, string>;
}

export interface SiteSettings {
  timezone: string;
  businessName: string;
  businessHours: {
    [day: string]: { start: string; end: string; enabled: boolean };
  };
}

export interface User {
  email: string;
  role: string;
}
