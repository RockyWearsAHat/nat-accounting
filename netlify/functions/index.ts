// Netlify Function entry point that wraps the Express app
import { handler } from "../../src/server/index";

// Export the serverless handler for Netlify
export { handler };
