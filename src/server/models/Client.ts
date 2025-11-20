import mongoose, { Schema, Document } from 'mongoose';

export interface IClient extends Document {
    name: string;
    logoUrl?: string;
    logoData?: Buffer; // Store image as Buffer in MongoDB
    logoContentType?: string; // e.g., 'image/png', 'image/jpeg'
    website?: string;
    color: string; // Hex color for tint filter
    displayOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const ClientSchema = new Schema<IClient>({
    name: {
        type: String,
        required: true,
        trim: true
    },
    logoUrl: {
        type: String,
        trim: true
    },
    logoData: {
        type: Buffer
    },
    logoContentType: {
        type: String
    },
    website: {
        type: String,
        trim: true
    },
    color: {
        type: String,
        default: '#798C8C' // Default teal-gray accent
    },
    displayOrder: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for efficient queries
ClientSchema.index({ isActive: 1, displayOrder: 1 });

export const ClientModel = mongoose.model<IClient>('Client', ClientSchema);
