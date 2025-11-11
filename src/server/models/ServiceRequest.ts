import mongoose from "mongoose";

const serviceRequestSchema = new mongoose.Schema(
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
        services: [
            {
                type: String,
                required: true,
            },
        ],
        status: {
            type: String,
            enum: ["pending", "approved", "in-progress", "completed", "rejected"],
            default: "pending",
        },
        notes: String,
        adminNotes: String,
        estimatedCost: Number,
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

export const ServiceRequestModel = mongoose.model("ServiceRequest", serviceRequestSchema);
