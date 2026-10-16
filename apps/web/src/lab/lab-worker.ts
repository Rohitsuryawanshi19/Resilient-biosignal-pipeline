import { EnginePipeline, type PipelineTelemetry } from '@mayacardio/engine';
import { IndexedDbStorage, QuotaStorage } from './indexeddb-storage.js';
import { BrowserMock, type MockFaultConfig } from './browser-mock.js';
import { BrowserNet } from './browser-net.js';
import { SkewableClock } from './browser-clock.js';

let running = false;
let abortController: AbortController | null = null;
let timeScale = 1; // 1x or 10x

const rawStorage = new IndexedDbStorage('mayacardio_pipeline_lab');
const storage = new QuotaStorage(rawStorage, 2 * 1024 * 1024, 64 * 1024);
const clock = new SkewableClock();
const mock = new BrowserMock('lab_' + Date.now(), 'ramp', 42);
const net = new BrowserNet();

const logger = {
  info: (msg: string, meta?: any) => {
    self.postMessage({ type: 'EVENT', event: { level: 'info', msg, meta, timestamp: clock.nowWallMs() } });
  },
  warn: (msg: string, meta?: any) => {
    self.postMessage({ type: 'EVENT', event: { level: 'warn', msg, meta, timestamp: clock.nowWallMs() } });
  },
  error: (msg: string, meta?: any) => {
    self.postMessage({ type: 'EVENT', event: { level: 'error', msg, meta, timestamp: clock.nowWallMs() } });
  },
  event: (type: string, meta?: any) => {
    self.postMessage({ type: 'EVENT', event: { level: 'event', type, meta, timestamp: clock.nowWallMs() } });
  },
};

let latestStats: PipelineTelemetry = {
  mode: 'offline',
  sessionId: mock.getSessionId(),
  samplesSaved: 0,
  samplesInCloud: 0,
  backlog: 0,
  losses: 0,
  cpuPct: 15,
  rssMb: 28,
};

const pipeline = new EnginePipeline({
  storage,
  clock,
  mock,
  net,
  logger,
  cycleIntervalMs: 500,
  onWindow: (result) => {
    self.postMessage({ type: 'WINDOW_RESULT', result });
  },
  onModeChange: (mode) => {
    latestStats.mode = mode;
    self.postMessage({
      type: 'EVENT',
      event: { level: 'event', type: 'mode_change', mode, timestamp: clock.nowWallMs() },
    });
  },
  onStats: (stats) => {
    latestStats = stats;
  },
});

// Periodic snapshot emitter (~10 Hz)
setInterval(() => {
  if (running) {
    net.tick();
    self.postMessage({
      type: 'SNAPSHOT',
      data: {
        ...latestStats,
        headIndex: mock.getHeadIndex(),
        clockWall: clock.nowWallMs(),
        clockMono: clock.nowMonoMs(),
        skewHours: clock.getSkewHours(),
        timeScale,
        isConnected: net.isConnected(),
        diskFull: storage.isDiskFull(),
        reserveActive: storage.isReserveActive(),
      },
    });
  }
}, 100);

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'START': {
      if (running) return;
      running = true;
      abortController = new AbortController();
      if (msg.config?.sessionId) {
        mock.restart(msg.config.sessionId);
        if (msg.config.headIndex) {
          mock.setHeadIndex(msg.config.headIndex);
        }
      }
      if (msg.config?.mode) mock.setMode(msg.config.mode);
      if (msg.config?.timeScale) timeScale = msg.config.timeScale;
      pipeline.setCycleIntervalMs(timeScale === 10 ? 50 : 500);

      logger.info('Lab Worker starting engine run');
      pipeline.start(abortController.signal).catch((err) => {
        logger.error('Pipeline loop terminated with error: ' + err.message);
      });
      break;
    }

    case 'STOP': {
      running = false;
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      logger.info('Lab Worker engine stopped');
      break;
    }

    case 'SET_TIME_SCALE': {
      timeScale = msg.scale || 1;
      pipeline.setCycleIntervalMs(timeScale === 10 ? 50 : 500);
      logger.info(`Time scale updated to ${timeScale}x`);
      break;
    }

    case 'INJECT_FAULT': {
      mock.setFaults(msg.fault || {});
      logger.warn('Fault injected into mock stream', msg.fault);
      break;
    }

    case 'CLEAR_FAULTS': {
      mock.clearFaults();
      logger.info('All mock faults cleared');
      break;
    }

    case 'CUT_NET': {
      net.cut();
      logger.warn('Network gate severed (offline)');
      break;
    }

    case 'RESTORE_NET': {
      net.restore();
      logger.info('Network gate restored');
      break;
    }

    case 'SKEW_CLOCK': {
      clock.addSkewHours(msg.hours || 0);
      logger.info(`Wall clock skewed by ${msg.hours} hours. Monotonic clock unaffected.`);
      break;
    }

    case 'AUDIT': {
      const res = await storage.audit(mock.getSessionId());
      self.postMessage({ type: 'AUDIT_RESULT', result: res });
      break;
    }

    case 'PULL_PLUG': {
      logger.warn('SIMULATED: Pull the plug triggered. Terminating worker mid-stream.');
      // Immediate crash simulation
      self.close();
      break;
    }

    case 'RESTART_MOCK': {
      const newSid = 'lab_' + Date.now();
      mock.restart(newSid);
      logger.info(`Mock restarted with new session ID: ${newSid}`);
      break;
    }

    case 'FILL_DISK': {
      storage.simulateDiskFull();
      logger.warn('SIMULATED DISK FULL: 64MB reserve space triggered for losses-only storage.');
      break;
    }

    case 'RESET': {
      running = false;
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      storage.resetQuota();
      mock.restart('lab_' + Date.now());
      await rawStorage.clear();
      await rawStorage.init();
      logger.info('Engine and IndexedDB storage reset clean.');
      break;
    }
  }
};

self.postMessage({ type: 'READY' });
