import { Schema, model, Document } from "mongoose";

export interface ISubscriptionService {
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
}

export interface IServiceSubscription extends Document {
    userId: string;
    userEmail: string;
    recurringServices: ISubscriptionService[]; // Monthly recurring services (baseline)
    billingDay: number; // Day of month to generate invoice (1-31)
    status: "active" | "paused" | "cancelled";
    lastInvoiceDate?: Date;
    monthlyRecurringTotal: number; // Total of recurring services only
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const SubscriptionServiceSchema = new Schema<ISubscriptionService>({
    description: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    unitPrice: { type: Number, required: true },
    amount: { type: Number, required: true }
}, { _id: false });

const ServiceSubscriptionSchema = new Schema<IServiceSubscription>({
    userId: { type: String, required: true, index: true },
    userEmail: { type: String, required: true },
    recurringServices: { type: [SubscriptionServiceSchema], required: true },
    billingDay: { type: Number, required: true, min: 1, max: 31 },
    status: { type: String, enum: ["active", "paused", "cancelled"], default: "active" },
    lastInvoiceDate: { type: Date },
    monthlyRecurringTotal: { type: Number, required: true },
    notes: { type: String }
}, { timestamps: true });

// Index for finding subscriptions to bill
ServiceSubscriptionSchema.index({ billingDay: 1, status: 1 });
ServiceSubscriptionSchema.index({ userId: 1, status: 1 });

// Helper to get actual billing date for a given month (handles month-end edge cases)
ServiceSubscriptionSchema.methods.getBillingDateForMonth = function (year: number, month: number): Date {
    const billingDay = this.billingDay;

    // Create date for target month
    const targetDate = new Date(year, month - 1, 1);

    // Get last day of the target month
    const lastDayOfMonth = new Date(year, month, 0).getDate();

    // Use billing day or last day of month, whichever is smaller
    const actualDay = Math.min(billingDay, lastDayOfMonth);
    targetDate.setDate(actualDay);

    // Set to midnight
    targetDate.setHours(0, 0, 0, 0);

    return targetDate;
};

export const ServiceSubscriptionModel = model<IServiceSubscription>("ServiceSubscription", ServiceSubscriptionSchema);
