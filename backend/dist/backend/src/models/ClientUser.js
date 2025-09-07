import mongoose from "mongoose";
const ClientUserSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: "client" },
    company: { type: String },
    website: { type: String },
    createdAt: { type: Date, default: Date.now },
});
export const ClientUser = mongoose.models.ClientUser || mongoose.model("ClientUser", ClientUserSchema);
