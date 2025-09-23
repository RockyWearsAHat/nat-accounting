import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
  id: string;
  email: string;
  role: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthPayload;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token =
    req.cookies?.token || req.header("authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "devsecret"
    ) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}
