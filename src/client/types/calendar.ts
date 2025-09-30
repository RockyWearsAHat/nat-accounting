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
  // RRULE expansion data from backend
  isRecurring?: boolean;
  rrule?: string; // Raw RRULE string
  recurrence?: any; // Google Calendar recurrence object
  raw?: string; // Raw iCal/vEvent data for EXDATE parsing
}

export interface AvailabilitySlot {
  start: string; // ISO
  end: string; // ISO
  available: boolean;
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
