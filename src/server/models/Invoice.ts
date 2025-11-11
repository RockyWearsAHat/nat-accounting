import mongoose from "mongoose";

const invoiceLineItemSchema = new mongoose.Schema({
    description: {
        type: String,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        default: 1,
    },
    unitPrice: {
        type: Number,
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
});

const invoiceSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        userEmail: {
            type: String,
            required: true,
        },
        invoiceNumber: {
            type: String,
            required: false, // Will be auto-generated
            unique: true,
        },
        customName: {
            type: String,
            required: false,
        },
        status: {
            type: String,
            enum: ["admin-draft", "pending-approval", "sent", "paid", "overdue", "cancelled"],
            default: "admin-draft",
        },
        lineItems: [invoiceLineItemSchema],
        subtotal: {
            type: Number,
            required: true,
        },
        tax: {
            type: Number,
            default: 0,
        },
        total: {
            type: Number,
            required: true,
        },
        dueDate: {
            type: Date,
            required: true,
        },
        paidDate: Date,
        paymentMethod: String,
        notes: String,
        recurringInvoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "RecurringInvoice",
        },
        billingMonth: {
            type: String,
            required: true,
            index: true
        }, // Format: "YYYY-MM" (e.g., "2025-01")
        serviceSubscriptionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ServiceSubscription",
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        updatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Auto-generate invoice number if not provided
invoiceSchema.pre("save", async function (next) {
    if (!this.invoiceNumber) {
        const count = await mongoose.model("Invoice").countDocuments();
        this.invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
    }
    next();
});

export const InvoiceModel = mongoose.model("Invoice", invoiceSchema);
