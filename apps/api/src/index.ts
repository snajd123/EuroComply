import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const port = parseInt(process.env['PORT'] || '3000', 10);

console.log(`Starting server on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
