import { Database } from 'bun:sqlite';
import worker, { SessionDO } from './index.js';

const sessions = new Map<string, SessionDO>();
const databases = new Map<string, Database>();

export function getSessionDO(id: string): SessionDO {
  let s = sessions.get(id);
  if (!s) {
    const db = new Database(':memory:');
    s = new SessionDO(null, {});
    s.initDb(db);
    s.sessionId = id;
    sessions.set(id, s);
    databases.set(id, db);
  }
  return s;
}

export function resetDevSessions(): void {
  for (const db of databases.values()) {
    try {
      db.close();
    } catch {}
  }
  sessions.clear();
  databases.clear();
}

export const devEnv = {
  SHARED_SECRET: 'mayacardio-secret-token',
  SESSION_DO: {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: (req: Request) => getSessionDO(id).fetch(req),
    }),
  },
};

export function startCloudDevServer(port = 8787) {
  const server = Bun.serve({
    port,
    fetch(req, bunServer) {
      const url = new URL(req.url);
      if (url.pathname.endsWith('/live')) {
        let sessionId = url.searchParams.get('session');
        if (!sessionId && req.headers.has('x-session-id')) {
          sessionId = req.headers.get('x-session-id');
        }
        sessionId = sessionId || 'default-session';
        const doInstance = getSessionDO(sessionId);
        if (bunServer.upgrade(req, { data: { doInstance } })) {
          return undefined;
        }
      }
      return worker.fetch(req, devEnv, null);
    },
    websocket: {
      message(ws, message) {
        const doInstance = (ws.data as any).doInstance as SessionDO;
        doInstance.handleWsMessage(ws as any, message);
      },
      open(ws) {
        const doInstance = (ws.data as any).doInstance as SessionDO;
        (doInstance as any).webSockets?.add(ws);
      },
      close(ws) {
        const doInstance = (ws.data as any).doInstance as SessionDO;
        (doInstance as any).webSockets?.delete(ws);
      },
    },
  });

  return server;
}

if (import.meta.main) {
  const port = Number(process.env.PORT) || 8787;
  const s = startCloudDevServer(port);
  console.log(`Cloud Dev Server running on http://127.0.0.1:${s.port}`);
}
