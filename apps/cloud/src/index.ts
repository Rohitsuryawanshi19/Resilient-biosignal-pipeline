import { SessionDO } from './session-do.js';
import { signLabToken, verifyLabToken } from './token.js';

export { SessionDO };

export interface Env {
  SESSION_DO: any; // DurableObjectNamespace
  ASSETS?: any; // Fetcher for static assets
  SHARED_SECRET?: string;
  GEMINI_API_KEY?: string;
}

const DEFAULT_SECRET = 'mayacardio-secret-token';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-session-id',
  };
}

function withCors(res: Response): Response {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-id');
  return res;
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const secret = env.SHARED_SECRET || DEFAULT_SECRET;

    // Serve static assets if not an API or streaming route
    const isApiRoute =
      path.startsWith('/api') ||
      path.startsWith('/events') ||
      path.startsWith('/blocks') ||
      path.startsWith('/sessions') ||
      path.startsWith('/ws') ||
      path.startsWith('/sync');

    if (!isApiRoute && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    // Public endpoint: check daily cloud budget
    if (path === '/api/lab/budget') {
      const budgetId = env.SESSION_DO.idFromName('__global_budget__');
      const budgetStub = env.SESSION_DO.get(budgetId);
      const res = await budgetStub.fetch(
        new Request('http://internal/budget/status' + url.search, {
          headers: { 'x-session-id': '__global_budget__' },
        })
      );
      return withCors(res);
    }

    // Public endpoint: mint visitor lab token
    if (path === '/api/lab/token') {
      const budgetId = env.SESSION_DO.idFromName('__global_budget__');
      const budgetStub = env.SESSION_DO.get(budgetId);
      const simulateExhausted = url.searchParams.get('simulate_exhausted') === '1';

      const budgetRes = await budgetStub.fetch(
        new Request(`http://internal/budget/status${simulateExhausted ? '?simulate_exhausted=1' : ''}`, {
          headers: { 'x-session-id': '__global_budget__' },
        })
      );
      const budget = (await budgetRes.json()) as any;

      if (budget.exhausted) {
        return withCors(
          new Response(
            JSON.stringify({
              status: 'budget_exceeded',
              message: 'cloud budget exhausted today',
              budget,
            }),
            {
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );
      }

      // Mint 15-minute token for unique lab session
      const rand = Math.random().toString(36).slice(2, 10);
      const sessionId = `labs/${rand}`;
      const expiresAt = Date.now() + 15 * 60 * 1000;
      const token = await signLabToken(secret, sessionId, expiresAt);

      // Record request in budget
      void budgetStub.fetch(
        new Request('http://internal/budget/record', {
          method: 'POST',
          headers: { 'x-session-id': '__global_budget__', 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: 1, writes: 0 }),
        })
      );

      return withCors(
        new Response(
          JSON.stringify({
            status: 'ok',
            sessionId,
            token,
            expiresAt,
            maxDurationSec: 90,
            budget,
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );
    }

    // Auth verification for all other paths
    let sessionId = url.searchParams.get('session');
    if (!sessionId && request.headers.has('x-session-id')) {
      sessionId = request.headers.get('x-session-id');
    }
    if (!sessionId) {
      sessionId = 'default-session';
    }

    const authHeader = request.headers.get('Authorization');
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : url.searchParams.get('token');

    let isAuthed = false;
    if (token === secret) {
      isAuthed = true;
    } else if (token) {
      const verified = await verifyLabToken(secret, token, sessionId);
      if (verified.valid) {
        isAuthed = true;
      }
    }

    if (!isAuthed) {
      return withCors(new Response('Unauthorized', { status: 401 }));
    }

    // Track usage in budget
    try {
      const budgetId = env.SESSION_DO.idFromName('__global_budget__');
      const budgetStub = env.SESSION_DO.get(budgetId);
      const isWrite = request.method === 'POST';
      void budgetStub.fetch(
        new Request('http://internal/budget/record', {
          method: 'POST',
          headers: { 'x-session-id': '__global_budget__', 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: 1, writes: isWrite ? 1 : 0 }),
        })
      );
    } catch {
      // Ignore background budget recording error
    }

    // Route to session DO
    const id = env.SESSION_DO.idFromName(sessionId);
    const stub = env.SESSION_DO.get(id);

    // Forward request with x-session-id header
    const headers = new Headers(request.headers);
    headers.set('x-session-id', sessionId);
    const forwardReq = new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
      // @ts-ignore Cloudflare WebSocket upgrade pass-through
      duplex: 'half',
    });

    const res = await stub.fetch(forwardReq);
    // Don't wrap WebSocket upgrade 101 responses
    if (res.status === 101) return res;
    return withCors(res);
  },
};
