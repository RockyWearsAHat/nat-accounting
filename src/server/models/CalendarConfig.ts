import mongoose from "mongoose";

export interface ICalendarConfig {
  busyCalendars: string[];
  whitelistUIDs: string[];
  busyEventUIDs: string[];
  calendarColors: Record<string, string>;
  calendarDisplayNames: Record<string, string>;
  colorOverwritten: Record<string, boolean>;
  updatedAt: Date;
}

const CalendarConfigSchema = new mongoose.Schema<ICalendarConfig>(
  {
    busyCalendars: { type: [String], default: [] },
    whitelistUIDs: { type: [String], default: [] },
    busyEventUIDs: { type: [String], default: [] },
    calendarColors: { type: mongoose.Schema.Types.Mixed, default: {} },
    calendarDisplayNames: { type: mongoose.Schema.Types.Mixed, default: {} },
    colorOverwritten: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export const CalendarConfigModel =
  mongoose.models.CalendarConfig ||
  mongoose.model<ICalendarConfig>("CalendarConfig", CalendarConfigSchema);

