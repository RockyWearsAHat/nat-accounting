import mongoose from "mongoose";

const GoogleTokensSubSchema = new mongoose.Schema(
  {
    refreshToken: { type: String },
    accessToken: { type: String },
    expiryDate: { type: Date },
    scope: { type: String },
    tokenType: { type: String },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["admin", "user"], default: "user" },
  company: { type: String },
  website: { type: String },
  googleTokens: { type: GoogleTokensSubSchema, default: {} },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
