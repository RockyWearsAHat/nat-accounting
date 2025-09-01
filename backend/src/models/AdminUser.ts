import mongoose from "mongoose";

const AdminUserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: "admin" },
  createdAt: { type: Date, default: Date.now },
});

export const AdminUser =
  mongoose.models.AdminUser || mongoose.model("AdminUser", AdminUserSchema);
