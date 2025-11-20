import mongoose, { Schema, Document } from 'mongoose';

export interface IClientMember extends Document {
    clientId: mongoose.Types.ObjectId;
    email: string;
    role: 'admin' | 'member';
    userId?: mongoose.Types.ObjectId | null;
    status: 'invited' | 'active' | 'revoked';
    invitedAt: Date;
    invitedBy?: mongoose.Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

const ClientMemberSchema = new Schema<IClientMember>(
    {
        clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        role: { type: String, enum: ['admin', 'member'], default: 'member' },
        userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        status: { type: String, enum: ['invited', 'active', 'revoked'], default: 'invited' },
        invitedAt: { type: Date, default: Date.now },
        invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

// A client may only have one member per email
ClientMemberSchema.index({ clientId: 1, email: 1 }, { unique: true });

export const ClientMemberModel =
    mongoose.models.ClientMember || mongoose.model<IClientMember>('ClientMember', ClientMemberSchema);
