/**
 * Netlify Function wrapper for Express API
 * 
 * This function serves as the entry point for all API routes on Netlify.
 * It imports the compiled Express app and wraps it with serverless-http.
 */

import { handler } from "../../src/server/index";

// Re-export the handler for Netlify Functions
export { handler };
