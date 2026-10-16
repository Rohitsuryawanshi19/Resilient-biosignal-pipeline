import { IndexedDbStorage, type AuditBootReport } from './indexeddb-storage.js';

export interface LabClientState {
  running: boolean;
  mode: 'online' | 'offline';
  samplesSaved: number;
  samplesInCloud: number;
  backlog: number;
  losses: number;
  clockWall: number;
  clockMono: number;
  skewHours: number;
  timeScale: number;
  isConnected: boolean;
  diskFull: boolean;
  reserveActive: boolean;
}

export class LabClient {
  private worker: Worker | null = null;
  private onSnapshot?: (state: LabClientState) => void;
  private onEvent?: (evt: any) => void;
  private onWindow?: (win: any) => void;
  private onBootAudit?: (reports: AuditBootReport[]) => void;

  constructor(options: {
    onSnapshot?: (state: LabClientState) => void;
    onEvent?: (evt: any) => void;
    onWindow?: (win: any) => void;
    onBootAudit?: (reports: AuditBootReport[]) => void;
  } = {}) {
    this.onSnapshot = options.onSnapshot;
    this.onEvent = options.onEvent;
    this.onWindow = options.onWindow;
    this.onBootAudit = options.onBootAudit;
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof Worker === 'undefined') return;

    this.worker = new Worker(new URL('./lab-worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (e) => {
      const msg = e.data;
      if (!msg) return;

      if (msg.type === 'SNAPSHOT' && this.onSnapshot) {
        this.onSnapshot(msg.data);
      } else if (msg.type === 'EVENT' && this.onEvent) {
        this.onEvent(msg.event);
      } else if (msg.type === 'WINDOW_RESULT' && this.onWindow) {
        this.onWindow(msg.result);
      }
    };
  }

  public start(config?: { mode?: 'ramp' | 'signal'; timeScale?: number }): void {
    this.worker?.postMessage({ type: 'START', config });
  }

  public stop(): void {
    this.worker?.postMessage({ type: 'STOP' });
  }

  public setTimeScale(scale: number): void {
    this.worker?.postMessage({ type: 'SET_TIME_SCALE', scale });
  }

  public injectFault(fault: any): void {
    this.worker?.postMessage({ type: 'INJECT_FAULT', fault });
  }

  public clearFaults(): void {
    this.worker?.postMessage({ type: 'CLEAR_FAULTS' });
  }

  public cutNet(): void {
    this.worker?.postMessage({ type: 'CUT_NET' });
  }

  public restoreNet(): void {
    this.worker?.postMessage({ type: 'RESTORE_NET' });
  }

  public skewClock(hours: number): void {
    this.worker?.postMessage({ type: 'SKEW_CLOCK', hours });
  }

  public async pullPlug(): Promise<AuditBootReport[]> {
    // 1. Immediately terminate worker mid-transaction (simulated crash)
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // 2. Perform recovery audit via IndexedDbStorage directly on main thread
    const recoveryStorage = new IndexedDbStorage('mayacardio_pipeline_lab');
    await recoveryStorage.init();
    const reports = recoveryStorage.getBootAuditReports();
    await recoveryStorage.close();

    if (this.onBootAudit) {
      this.onBootAudit(reports);
    }

    // 3. Restart worker ready for next commands
    this.initWorker();
    return reports;
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
