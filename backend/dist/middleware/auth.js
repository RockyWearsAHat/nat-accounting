import jwt from "jsonwebtoken";
export function requireAuth(req, res, next) {
    const token = req.cookies?.token || req.header("authorization")?.replace("Bearer ", "");
    if (!token)
        return res.status(401).json({ error: "unauthorized" });
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET || "devsecret");
        req.user = payload;
        next();
    }
    catch {
        return res.status(401).json({ error: "invalid_token" });
    }
}
