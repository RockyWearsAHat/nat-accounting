import fs from "fs";
import path from "path";
import dotenv from "dotenv";

export function loadEnv() {
  // Skip .env file loading on Netlify (and other serverless platforms)
  // Environment variables are already injected by the platform
  const isNetlify = process.env.NETLIFY === "true";
  const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL;

  if (isNetlify || isServerless) {
    console.log(`[env] Running on serverless platform - using injected environment variables`);
    if (process.env.MONGODB_URI) {
      const masked = (process.env.MONGODB_URI as string).replace(
        /:[^:@/]+@/,
        ":****@"
      );
      console.log(`[env] MONGODB_URI configured: ${masked}`);
    } else {
      console.error(`[env] MONGODB_URI not found in environment variables`);
    }
    return;
  }

  // Local development: Look for .env file
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
