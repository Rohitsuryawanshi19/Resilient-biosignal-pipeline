import { EnginePipeline } from '@mayacardio/engine';
import { IndexedDbStorage } from '../adapters/indexeddb-storage.js';
import { BrowserClock } from '../adapters/browser-clock.js';
import { BrowserMockSource } from '../adapters/browser-mock.js';
import { BrowserNet } from '../adapters/browser-net.js';

let storage = new IndexedDbStorage();
let clock = new BrowserClock();
let mock = new BrowserMockSource();
let net = new BrowserNet();
let pipeline: EnginePipeline | null = null;
let ac: AbortController | null = null;

const logger = {
  info: (msg: string) => postMessage({ type: 'log', level: 'info', msg }),
  warn: (msg: string) => postMessage({ type: 'log', level: 'warn', msg }),
  error: (msg: string) => postMessage({ type: 'log', level: 'error', msg }),
  event: (type: string, meta: any) => postMessage({ type: 'engine_event', eventType: type, meta }),
};

function initPipeline() {
  ac = new AbortController();
  pipeline = new EnginePipeline({
    storage,
    clock,
    mock,
    net,
    logger,
    onWindow: (win) => postMessage({ type: 'window', result: win }),
    onModeChange: (mode) => postMessage({ type: 'mode', mode }),
    onStats: (stats) => postMessage({ type: 'telemetry', stats }),
  });
  pipeline.start(ac.signal).catch((err) => {
    postMessage({ type: 'error', error: err?.message || String(err) });
  });
}

self.onmessage = async (e: MessageEvent) => {
  const { action, payload } = e.data || {};

  switch (action) {
    case 'start':
      if (!pipeline) initPipeline();
      break;

    case 'stop':
      if (pipeline) {
        pipeline.stop();
        if (ac) ac.abort();
        pipeline = null;
      }
      break;

    case 'cut_network':
      net.cut();
      postMessage({ type: 'log', level: 'warn', msg: 'Simulated fault: Network severed' });
      break;

    case 'restore_network':
      net.restore();
      postMessage({ type: 'log', level: 'info', msg: 'Network restored' });
      break;

    case 'corrupt_crc':
      mock.corruptNextCrcCount = payload?.count ?? 1;
      postMessage({ type: 'log', level: 'warn', msg: 'Simulated fault: Injected corrupt CRC' });
      break;

    case 'inject_loss':
      mock.injectLossNext = true;
      postMessage({ type: 'log', level: 'warn', msg: 'Simulated fault: Injected sensor discontinuity' });
      break;

    case 'stall_sensor':
      mock.stallDelayMs = payload?.delayMs ?? 1500;
      setTimeout(() => { mock.stallDelayMs = 0; }, (payload?.delayMs ?? 1500) * 2);
      break;

    case 'audit':
      if (payload?.sessionId) {
        const res = await storage.audit(payload.sessionId);
        postMessage({ type: 'audit_result', audit: res });
      }
      break;

    default:
      break;
  }
};
