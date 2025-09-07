import fs from "fs";
import path from "path";
import dotenv from "dotenv";
const backendDir = path.dirname(new URL(import.meta.url).pathname);
const rootDotenv = path.resolve(process.cwd(), ".env");
const backendDotenv = path.resolve(backendDir, "../.env");
const tried = [];
function tryLoad(p) {
    tried.push(p);
    if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        return !!process.env.MONGODB_URI;
    }
    return false;
}
// Priority: explicit ROOT, then backend local, then fallback plain dotenv (which scans CWD)
let loaded = tryLoad(rootDotenv);
if (!loaded)
    loaded = tryLoad(backendDotenv);
if (!loaded) {
    dotenv.config();
    loaded = !!process.env.MONGODB_URI;
}
if (!loaded) {
    console.warn("[env] MONGODB_URI not found. Tried:", tried);
}
else {
    const masked = process.env.MONGODB_URI.replace(/:[^:@/]+@/, ":****@");
    console.log("[env] Loaded MONGODB_URI from", tried.find((p) => fs.existsSync(p)) || "default", masked);
}
