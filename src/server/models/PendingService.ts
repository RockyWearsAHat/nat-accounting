import { Schema, model, Document } from "mongoose";

export interface IPendingService extends Document {
    userId: string;
    userEmail: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    serviceDate: Date; // When the service was performed
    billingMonth: string; // Format: "YYYY-MM" - which month's invoice this should appear on
    invoiced: boolean; // Has this been added to an invoice yet?
    invoiceId?: string; // Reference to the invoice it was added to
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const PendingServiceSchema = new Schema<IPendingService>({
    userId: { type: String, required: true, index: true },
    userEmail: { type: String, required: true },
    description: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    unitPrice: { type: Number, required: true },
    amount: { type: Number, required: true },
    serviceDate: { type: Date, required: true },
    billingMonth: { type: String, required: true }, // "2025-01" format
    invoiced: { type: Boolean, default: false, index: true },
    invoiceId: { type: String },
    notes: { type: String }
}, { timestamps: true });

// Index for finding pending services to add to invoice
PendingServiceSchema.index({ billingMonth: 1, invoiced: 1 });
PendingServiceSchema.index({ userId: 1, invoiced: 1 });

export const PendingServiceModel = model<IPendingService>("PendingService", PendingServiceSchema);
