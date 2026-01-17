export interface Env {
  DPP_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response('DPP Worker - Coming Soon', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
