import fs from "fs";
import path from "path";
import dotenv from "dotenv";

export function loadEnv() {
  // Look for .env in the project root (two levels up from src/server)
  const projectRoot = path.resolve(process.cwd());
  const rootDotenv = path.join(projectRoot, ".env");

  console.log(`[env] Looking for .env at: ${rootDotenv}`);

  if (fs.existsSync(rootDotenv)) {
    dotenv.config({ path: rootDotenv });
    if (process.env.MONGODB_URI) {
      const masked = (process.env.MONGODB_URI as string).replace(
        /:[^:@/]+@/,
        ":****@"
      );
      console.log(`[env] Successfully loaded .env from ${rootDotenv}`);
      console.log(`[env] MONGODB_URI: ${masked}`);
    } else {
      console.warn(`[env] .env file found but MONGODB_URI not set`);
    }
  } else {
    // Fallback to default dotenv behavior
    dotenv.config();
    if (process.env.MONGODB_URI) {
      console.log(`[env] Loaded from default location`);
    } else {
      console.error(`[env] .env file not found at ${rootDotenv} and no MONGODB_URI in environment`);
    }
  }
}

// Call loadEnv immediately when this module is imported
loadEnv();
