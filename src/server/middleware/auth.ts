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
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const token =
    req.cookies?.token || req.header("authorization")?.replace("Bearer ", "");
  
  if (!token) {
    const errorResponse = isDevelopment 
      ? { 
          error: "unauthorized", 
          message: "No authentication token found. Please login first.",
          debug: {
            hasCookieToken: !!req.cookies?.token,
            hasAuthHeader: !!req.header("authorization"),
            endpoint: `${req.method} ${req.originalUrl}`
          }
        }
      : { error: "unauthorized" };
    return res.status(401).json(errorResponse);
  }
  
  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "devsecret"
    ) as AuthPayload;
    req.user = payload;
    next();
  } catch (error) {
    const errorResponse = isDevelopment 
      ? { 
          error: "invalid_token", 
          message: "Authentication token is invalid or expired. Please login again.",
          debug: {
            tokenLength: token.length,
            errorType: error instanceof jwt.JsonWebTokenError ? error.name : 'unknown',
            endpoint: `${req.method} ${req.originalUrl}`
          }
        }
      : { error: "invalid_token" };
    return res.status(401).json(errorResponse);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  if (!req.user) {
    const errorResponse = isDevelopment 
      ? { 
          error: "authentication_required", 
          message: "This endpoint requires authentication. Please login first.",
          debug: { endpoint: `${req.method} ${req.originalUrl}` }
        }
      : { error: "authentication_required" };
    return res.status(401).json(errorResponse);
  }
  
  if (req.user.role !== 'admin') {
    const errorResponse = isDevelopment 
      ? { 
          error: "admin_required", 
          message: "This endpoint requires admin privileges.",
          debug: { 
            userRole: req.user.role,
            userId: req.user.id,
            endpoint: `${req.method} ${req.originalUrl}`
          }
        }
      : { error: "admin_required" };
    return res.status(403).json(errorResponse);
  }
  
  next();
}
