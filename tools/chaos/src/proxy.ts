import * as net from 'node:net';

export type FaultType =
  | 'none'
  | 'stall'
  | 'corrupt_crc'
  | 'duplicate_reply'
  | 'drop_sensor'
  | 'restart_mock'
  | 'slow_replies'
  | 'unreported_gap';

export interface ProxyFaultConfig {
  fault: FaultType;
  stallMs?: number;
  dropSensorId?: 1 | 2;
  slowDelayMs?: number;
  gapSize?: number;
  corruptCount?: number; // how many replies to corrupt before resuming
}

export class FaultProxy {
  private server: net.Server | null = null;
  private mockHost: string;
  private mockPort: number;
  private proxyPort: number;
  public faultConfig: ProxyFaultConfig = { fault: 'none' };
  private activeSockets = new Set<net.Socket>();
  private mockSockets = new Set<net.Socket>();

  constructor(opts: { proxyPort: number; mockHost?: string; mockPort?: number }) {
    this.proxyPort = opts.proxyPort;
    this.mockHost = opts.mockHost ?? '127.0.0.1';
    this.mockPort = opts.mockPort ?? 7100;
  }

  public setFault(config: ProxyFaultConfig): void {
    this.faultConfig = { ...config };
  }

  public clearFault(): void {
    this.faultConfig = { fault: 'none' };
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((clientSocket) => {
        this.handleClient(clientSocket);
      });

      this.server.listen(this.proxyPort, '127.0.0.1', () => {
        const addr = this.server!.address() as net.AddressInfo;
        this.proxyPort = addr.port;
        resolve(this.proxyPort);
      });

      this.server.on('error', reject);
    });
  }

  private handleClient(clientSocket: net.Socket): void {
    this.activeSockets.add(clientSocket);

    const mockSocket = net.createConnection({
      host: this.mockHost,
      port: this.mockPort,
    });
    this.mockSockets.add(mockSocket);

    let clientBuf = '';
    let mockBuf = '';
    let corruptRemaining = this.faultConfig.corruptCount ?? 1;

    clientSocket.on('data', async (chunk) => {
      clientBuf += chunk.toString();
      while (clientBuf.includes('\n')) {
        const idx = clientBuf.indexOf('\n');
        const line = clientBuf.slice(0, idx).trim();
        clientBuf = clientBuf.slice(idx + 1);
        if (!line) continue;

        try {
          const req = JSON.parse(line);
          if (this.faultConfig.fault === 'drop_sensor' && req.sensor === this.faultConfig.dropSensorId) {
            // Drop request completely (simulate silent sensor)
            continue;
          }
        } catch {}

        if (this.faultConfig.fault === 'stall' && this.faultConfig.stallMs) {
          await Bun.sleep(this.faultConfig.stallMs);
        }

        mockSocket.write(line + '\n');
      }
    });

    mockSocket.on('data', async (chunk) => {
      mockBuf += chunk.toString();
      while (mockBuf.includes('\n')) {
        const idx = mockBuf.indexOf('\n');
        const line = mockBuf.slice(0, idx).trim();
        mockBuf = mockBuf.slice(idx + 1);
        if (!line) continue;

        if (this.faultConfig.fault === 'slow_replies' && this.faultConfig.slowDelayMs) {
          await Bun.sleep(this.faultConfig.slowDelayMs);
        }

        let replyObj: any;
        try {
          replyObj = JSON.parse(line);
        } catch {
          clientSocket.write(line + '\n');
          continue;
        }

        // Apply Injected Faults
        if (this.faultConfig.fault === 'corrupt_crc' && corruptRemaining > 0) {
          replyObj.crc32 = ((replyObj.crc32 ?? 0) ^ 0xffffffff) >>> 0;
          corruptRemaining--;
          clientSocket.write(JSON.stringify(replyObj) + '\n');
        } else if (this.faultConfig.fault === 'duplicate_reply') {
          // Send duplicate reply back to client
          const rep = JSON.stringify(replyObj) + '\n';
          clientSocket.write(rep);
          clientSocket.write(rep);
        } else if (this.faultConfig.fault === 'drop_sensor' && replyObj.sensor === this.faultConfig.dropSensorId) {
          // Drop reply
          continue;
        } else {
          clientSocket.write(JSON.stringify(replyObj) + '\n');
        }
      }
    });

    const cleanup = () => {
      this.activeSockets.delete(clientSocket);
      this.mockSockets.delete(mockSocket);
      clientSocket.destroy();
      mockSocket.destroy();
    };

    clientSocket.on('close', cleanup);
    clientSocket.on('error', cleanup);
    mockSocket.on('close', cleanup);
    mockSocket.on('error', cleanup);
  }

  public close(): void {
    for (const s of this.activeSockets) s.destroy();
    for (const s of this.mockSockets) s.destroy();
    this.activeSockets.clear();
    this.mockSockets.clear();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
