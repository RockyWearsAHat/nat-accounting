// Import the compiled handler from the built server
const { handler } = require('../../dist/server/index.js');

// Export the handler for Netlify Functions
exports.handler = handler;
