import mongoose, { Schema, Document } from "mongoose";

export interface IBusinessHours extends Document {
    dayOfWeek: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
    openTime: string; // e.g., "7:00 AM" or "9:00 AM"
    closeTime: string; // e.g., "5:00 PM" or "6:00 PM"
    isClosed: boolean; // true if business is closed this day
    displayFormat: string; // e.g., "7am - 5pm" for display purposes
    startMinutes: number; // minutes from midnight (e.g., 420 for 7am)
    endMinutes: number; // minutes from midnight (e.g., 1020 for 5pm)
}

const BusinessHoursSchema = new Schema<IBusinessHours>(
    {
        dayOfWeek: {
            type: String,
            required: true,
            unique: true,
            enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        },
        openTime: {
            type: String,
            required: true,
        },
        closeTime: {
            type: String,
            required: true,
        },
        isClosed: {
            type: Boolean,
            default: false,
        },
        displayFormat: {
            type: String,
            required: true,
        },
        startMinutes: {
            type: Number,
            required: true,
        },
        endMinutes: {
            type: Number,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

export const BusinessHoursModel = mongoose.model<IBusinessHours>(
    "BusinessHours",
    BusinessHoursSchema
);
