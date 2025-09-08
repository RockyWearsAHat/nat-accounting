import mongoose from "mongoose";

const GoogleTokensSubSchema = new mongoose.Schema(
  {
  refreshToken: { type: String },
    expiryDate: { type: Date },
    scope: { type: String },
    tokenType: { type: String },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const adminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "admin" },
  timezone: { type: String, default: "America/Denver" }, // Utah timezone
  googleTokens: { type: GoogleTokensSubSchema, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const AdminUserModel = mongoose.model("AdminUser", adminUserSchema);
