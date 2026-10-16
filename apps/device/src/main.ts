import * as fs from 'node:fs';
import * as path from 'node:path';
import { runAudit } from './audit.js';
import { runReader } from './reader.js';
import { Store } from './store.js';
import { SyncClient } from './sync.js';
import { ModeController } from './mode.js';

let dataDir = process.env.DATA_DIR || './data';
let dbPath = process.env.PIPELINE_DB || path.join(dataDir, 'pipeline.db');
let mockHost = process.env.MOCK_HOST || '127.0.0.1';
let mockPort = parseInt(process.env.MOCK_PORT || '7100', 10);
let cloudUrl = process.env.CLOUD_URL || 'http://127.0.0.1:8787';
let cloudToken = process.env.CLOUD_TOKEN || 'mayacardio-secret-token';

let command: string | undefined;
let sessionId: string | undefined;
let fromSource: 'device' | 'cloud' = 'device';

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--db' && i + 1 < args.length) {
    dbPath = args[++i]!;
  } else if (arg === '--data-dir' && i + 1 < args.length) {
    dataDir = args[++i]!;
    dbPath = path.join(dataDir, 'pipeline.db');
  } else if ((arg === '--host' || arg === '--mock-host') && i + 1 < args.length) {
    mockHost = args[++i]!;
  } else if ((arg === '--port' || arg === '--mock-port') && i + 1 < args.length) {
    mockPort = parseInt(args[++i]!, 10);
  } else if (arg === '--cloud-url' && i + 1 < args.length) {
    cloudUrl = args[++i]!;
  } else if (arg === '--token' && i + 1 < args.length) {
    cloudToken = args[++i]!;
  } else if (arg === '--session' && i + 1 < args.length) {
    sessionId = args[++i]!;
  } else if (arg === '--from' && i + 1 < args.length) {
    const val = args[++i]!;
    if (val === 'device' || val === 'cloud') fromSource = val;
  } else if (arg && !arg.startsWith('--') && !command) {
    command = arg;
  }
}

const reservePath = dbPath + '.reserve';

if (!command) {
  console.error('Usage: pipeline [--db PATH] [--mock-host HOST] [--mock-port PORT] [--cloud-url URL] <run|status|export|results|audit>');
  process.exit(1);
}

switch (command) {
  case 'run': {
    const store = new Store({ dbPath, reservePath });
    const modeController = new ModeController();
    const syncClient = new SyncClient({ cloudUrl, sharedSecret: cloudToken });
    const ac = new AbortController();

    const onSignal = () => {
      ac.abort();
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    // Background sync loop
    const syncLoop = (async () => {
      while (!ac.signal.aborted) {
        await Bun.sleep(2000);
        if (ac.signal.aborted) break;
        try {
          const latestSess = store.getLatestSessionId();
          if (latestSess) {
            await syncClient.syncSession(latestSess, store);
            modeController.recordAck();
          }
        } catch {
          modeController.tick();
        }
      }
    })();

    try {
      await runReader({
        host: mockHost,
        port: mockPort,
        store,
        mode: modeController.getMode(),
      }, ac.signal);
    } finally {
      ac.abort();
      await syncLoop.catch(() => {});
      store.close();
    }
    break;
  }

  case 'status': {
    // Read-only connection: safe while daemon is running concurrently
    let store: Store | null = null;
    try {
      store = new Store({ dbPath, readonly: true });
    } catch {
      // If DB file doesn't exist yet
    }

    const currentSession = sessionId || store?.getLatestSessionId() || 'none';
    const samplesSaved = store ? store.getSamplesSaved(currentSession !== 'none' ? currentSession : undefined) : 0;
    const backlog = store ? store.getBacklogCount(currentSession !== 'none' ? currentSession : undefined) : 0;

    let samplesInCloud = 0;
    let mode = 'offline';

    // Quick health probe to cloud
    try {
      const syncClient = new SyncClient({ cloudUrl, sharedSecret: cloudToken });
      if (currentSession !== 'none') {
        const cloudState = await syncClient.getCloudState(currentSession);
        for (const s of [1, 2] as const) {
          const ranges = cloudState[s] ?? [];
          for (const r of ranges) {
            samplesInCloud += (r.to - r.from);
          }
        }
        mode = 'online';
      }
    } catch {
      mode = 'offline';
    }

    if (store) store.close();

    // EXACTLY one JSON line
    console.log(JSON.stringify({
      mode,
      session_id: currentSession,
      samples_saved: samplesSaved,
      samples_in_cloud: samplesInCloud,
      backlog,
    }));
    break;
  }

  case 'export': {
    if (!sessionId) {
      console.error('Error: --session ID required for export');
      process.exit(1);
    }

    if (fromSource === 'cloud') {
      const url = `${cloudUrl}/export?session=${encodeURIComponent(sessionId)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${cloudToken}` },
      });
      if (!res.ok) {
        console.error(`Cloud export failed with HTTP ${res.status}`);
        process.exit(1);
      }
      if (res.body) {
        const reader = res.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          process.stdout.write(value);
        }
      }
    } else {
      const store = new Store({ dbPath, readonly: true });
      try {
        for (const line of store.streamExport(sessionId)) {
          process.stdout.write(line);
        }
      } finally {
        store.close();
      }
    }
    break;
  }

  case 'results': {
    if (!sessionId) {
      console.error('Error: --session ID required for results');
      process.exit(1);
    }

    const store = new Store({ dbPath, readonly: true });
    try {
      const results = store.getResultsForSession(sessionId);
      for (const res of results) {
        console.log(res);
      }
    } finally {
      store.close();
    }
    break;
  }

  case 'audit': {
    const store = new Store({ dbPath, readonly: true });
    try {
      const reports = runAudit(store);
      console.log(JSON.stringify(reports, null, 2));
      const allOk = reports.every((r) => r.ok);
      if (!allOk) {
        process.exit(1);
      }
    } finally {
      store.close();
    }
    break;
  }

  default: {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
