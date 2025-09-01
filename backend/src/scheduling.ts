import { randomUUID } from "crypto";
import type { ScheduledMeeting } from "shared";
import { MeetingModel } from "./models/Meeting.js";

// In-memory store until DB persistence extended
const meetings: ScheduledMeeting[] = [];

export async function listMeetings(): Promise<ScheduledMeeting[]> {
  if (process.env.MONGODB_URI) {
    const docs = await MeetingModel.find().sort({ start: 1 }).lean();
    return docs.map((d: any) => ({
      id: d._id.toString(),
      consultationId: d.consultationId,
      start: d.start.toISOString(),
      end: d.end.toISOString(),
      createdAt: d.createdAt.toISOString(),
      provider: d.provider,
      joinUrl: d.joinUrl,
      status: d.status,
    }));
  }
  return meetings.slice();
}

export function isSlotAvailable(startISO: string, endISO: string): boolean {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  return !meetings.some((m) => {
    if (m.status !== "scheduled") return false;
    const ms = new Date(m.start).getTime();
    const me = new Date(m.end).getTime();
    return start < me && end > ms; // overlap
  });
}

export async function scheduleMeeting(
  consultationId: string,
  start: string,
  end: string
): Promise<ScheduledMeeting> {
  if (process.env.MONGODB_URI) {
    const doc = await MeetingModel.create({ consultationId, start, end });
    return {
      id: doc._id.toString(),
      consultationId,
      start: doc.start.toISOString(),
      end: doc.end.toISOString(),
      createdAt: doc.createdAt.toISOString(),
      status: doc.status,
    };
  }
  const meeting: ScheduledMeeting = {
    id: randomUUID(),
    consultationId,
    start,
    end,
    createdAt: new Date().toISOString(),
    status: "scheduled",
  };
  meetings.push(meeting);
  return meeting;
}

export async function cancelMeeting(id: string): Promise<boolean> {
  if (process.env.MONGODB_URI) {
    const doc = await MeetingModel.findById(id);
    if (!doc) return false;
    doc.status = "cancelled";
    await doc.save();
    return true;
  }
  const m = meetings.find((m) => m.id === id);
  if (!m) return false;
  m.status = "cancelled";
  return true;
}
