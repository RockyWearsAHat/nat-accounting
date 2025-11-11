import mongoose, { Schema, Document } from "mongoose";

export interface IFolder extends Document {
    userId: string;
    name: string; // Full path (e.g., "Tax/2024/Q1")
    color: string;
    createdAt: Date;
    updatedAt: Date;
}

const FolderSchema = new Schema<IFolder>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
        },
        color: {
            type: String,
            required: true,
            default: "#4a9eff",
        },
    },
    {
        timestamps: true,
    }
);

// Compound index: each user can only have one folder with a given name
FolderSchema.index({ userId: 1, name: 1 }, { unique: true });

const FolderModel = mongoose.model<IFolder>("Folder", FolderSchema);

export default FolderModel;
