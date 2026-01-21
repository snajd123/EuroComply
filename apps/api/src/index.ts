import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const app = createApp();
const port = parseInt(process.env['PORT'] ?? '3001', 10);

console.log(`Starting server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);
