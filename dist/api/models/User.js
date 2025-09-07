import mongoose from "mongoose";
const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    company: { type: String },
    website: { type: String },
    createdAt: { type: Date, default: Date.now },
});
export const User = mongoose.models.User || mongoose.model("User", UserSchema);
