import React, { useState } from 'react';
import { Card } from '../components/Card.js';
import { Button } from '../components/Button.js';
import { ModeToggle } from '../components/ModeToggle.js';
import './Architecture.css';

interface NodeInfo {
  id: string;
  title: string;
  role: string;
  guarantee: string;
  nonGuarantee: string;
  rationale: string;
}

export const Architecture: React.FC = () => {
  const [activeNode, setActiveNode] = useState<string>('wal');
  const [networkCut, setNetworkCut] = useState<boolean>(false);

  const nodeData: Record<string, NodeInfo> = {
    reader: {
      id: 'reader',
      title: 'Raw TCP Reader Loop (:7100)',
      role: 'Ingests multi-channel 400 Hz NDJSON streams from sensors over local TCP socket :7100',
      guarantee:
        'Raw Substring CRC-32 Validation: Zlib CRC is computed on raw JSON slice from [ to ] without parse overhead, ensuring mathematical integrity before serialization.',
      nonGuarantee:
        'Does not prevent socket-level sensor silence. If the mock stalls silently >10s monotonic, the reader aborts the connection and logs sensor_timeout.',
      rationale:
        'Avoids CPU allocations and floating-point serialization discrepancies. Re-reads with from_index on checksum mismatch.',
    },
    wal: {
      id: 'wal',
      title: 'Local SQLite WAL Log (Pi 4)',
      role: 'Durable on-disk persistence on Raspberry Pi with 64 MB emergency reserve file',
      guarantee:
        'Commit-Before-Advance: PRAGMA synchronous=FULL fsyncs WAL commit to disk before advancing the stream pointer, bounding power-cut loss to <= 1 in-flight reply (<= 1.0s / 400 samples).',
      nonGuarantee:
        'Does not guarantee persistence if consumer SD card firmware dishonestly acknowledges fsync barriers before NAND commit. Industrial pSLC media or capacitor UPS is required for clinical zero-loss.',
      rationale:
        'Limits worst-case crash loss to at most 1 in-flight reply. A 64 MB pre-allocated reserve file is unlinked automatically on ENOSPC to persist emergency loss records.',
    },
    dsp: {
      id: 'dsp',
      title: 'O(1) Streaming Processor (@mayacardio/core)',
      role: 'Processes 400-sample (1s) windows, calculating channel statistics and greedy ECG peak detection',
      guarantee:
        'Constant Memory Bound: Maintains 800-sample circular lookback; evicts raw samples immediately upon window completion, keeping RSS strictly <= 48.2 MB.',
      nonGuarantee:
        'Does not emit heart rate if any sample in the 5-second lookback is lost or incomplete. Medical safety invariants require null over guessed telemetry.',
      rationale:
        'Strictly O(1) RAM footprint independent of session duration. Finalizes deterministically when lookahead sample arrives.',
    },
    sync: {
      id: 'sync',
      title: 'Two-Lane Sync Client',
      role: 'Coordinates Priority 1 live WebSocket streaming with Priority 2 batched HTTP catch-up',
      guarantee:
        'Diff-Queue Idempotency: Handshakes cloud_has set, subtracts from local_stored using interval algebra, and uploads only missing ranges. Zero redundant payloads.',
      nonGuarantee:
        'Does not guarantee zero network latency during active outages. Traffic is buffered locally on disk until network restore.',
      rationale:
        'Eliminates duplicate transmission. A 2-hour outage backlog (14,400 blocks) catches up in ~70-90 seconds over HTTP.',
    },
    cloud: {
      id: 'cloud',
      title: 'Cloudflare Session Durable Object',
      role: 'Edge stateful actor with SQLite backend running online verification and lazy differential checking alarms',
      guarantee:
        'Zero-Cost Free-Tier Fit: Consumes 0.72% daily write budget (7,200 rows/hr); WebSocket Hibernation eliminates idle duration billing completely.',
      nonGuarantee:
        'Does not offer infinite cloud storage on the Free plan. Inactive lab sessions auto-delete after 24 hours via DO alarms.',
      rationale:
        'Durable Objects colocate in-memory state with fast SQLite storage at Cloudflare edge with 100k requests/day free.',
    },
    ui: {
      id: 'ui',
      title: 'Spatial Neumorphic Glass UI',
      role: 'Web client receiving live SSE events or playing back recorded failure timelines',
      guarantee:
        'Truth in Telemetry: Displays data-source badges (LIVE, SIMULATION, RECORDED). Never fabricates numbers.',
      nonGuarantee:
        'Browser environment cannot reproduce raw Linux kernel panics or physical SD card corruption. Power cuts in browser are simulated via Web Worker termination.',
      rationale:
        'Provides recruiters an interactive testbench with 60fps canvas ECG, ledger tiling, and chaos buttons.',
    },
  };

  const current = nodeData[activeNode] || nodeData['wal']!;

  return (
    <div className="arch-container">
      <header className="arch-header">
        <h1 className="arch-title">Interactive Systems Architecture</h1>
        <p className="arch-subtitle">
          Click any component to inspect its mathematical guarantees, failure non-guarantees, and low-level engineering rationale.
        </p>
      </header>

      {/* Network Cut Interactive Toggle Banner */}
      <div className={`arch-simulation-strip ${networkCut ? 'strip-cut' : 'strip-normal'}`}>
        <div className="strip-info">
          <span className="strip-badge font-mono">
            {networkCut ? 'SIMULATED OUTAGE ACTIVE' : 'STEADY-STATE STREAMING'}
          </span>
          <span className="strip-desc">
            {networkCut
              ? 'Edge network link severed. Sync severs; data diverts to Raspberry Pi local SQLite WAL buffer.'
              : 'WebSocket Priority 1 active. Data flows straight from device DSP to Cloudflare Edge.'}
          </span>
        </div>

        <Button
          variant={networkCut ? 'accent-online' : 'danger'}
          size="sm"
          onClick={() => setNetworkCut(!networkCut)}
        >
          {networkCut ? '✓ Restore Network Link' : '⚡ Simulate Network Cut'}
        </Button>
      </div>

      {/* Interactive Diagram Canvas */}
      <Card header="End-to-End Biosignal Dataflow (Animated Packets)" glowColor={networkCut ? 'coral' : 'blue'}>
        <div className="diagram-canvas">
          {/* Device Side Column */}
          <div className="diagram-column">
            <span className="column-label font-mono">Raspberry Pi 4 Edge (Bun)</span>

            <div
              className={`arch-node ${activeNode === 'reader' ? 'node-active' : ''}`}
              onClick={() => setActiveNode('reader')}
            >
              <div className="node-icon">📡</div>
              <div className="node-text">
                <span className="node-name">TCP Reader</span>
                <span className="node-sub">Raw Substring CRC-32</span>
              </div>
            </div>

            <div className="packet-track track-down">
              <span className="packet packet-dot" />
            </div>

            <div
              className={`arch-node ${activeNode === 'wal' ? 'node-active' : ''} ${
                networkCut ? 'node-buffering' : ''
              }`}
              onClick={() => setActiveNode('wal')}
            >
              <div className="node-icon">💾</div>
              <div className="node-text">
                <span className="node-name">SQLite WAL Log</span>
                <span className="node-sub">
                  {networkCut ? 'BUFFERING BACKLOG (synchronous=FULL)' : 'synchronous=FULL'}
                </span>
              </div>
              {networkCut && <span className="buffering-badge font-mono">QUEUING</span>}
            </div>

            <div className="packet-track track-down">
              <span className="packet packet-dot" />
            </div>

            <div
              className={`arch-node ${activeNode === 'dsp' ? 'node-active' : ''}`}
              onClick={() => setActiveNode('dsp')}
            >
              <div className="node-icon">⚙️</div>
              <div className="node-text">
                <span className="node-name">O(1) Streaming DSP</span>
                <span className="node-sub">800-sample Lookback Ring</span>
              </div>
            </div>
          </div>

          {/* Sync Bridge Edge */}
          <div className="diagram-bridge">
            <div
              className={`arch-node bridge-node ${activeNode === 'sync' ? 'node-active' : ''} ${
                networkCut ? 'node-severed' : ''
              }`}
              onClick={() => setActiveNode('sync')}
            >
              <div className="node-icon">{networkCut ? '❌' : '🔄'}</div>
              <div className="node-text">
                <span className="node-name">Two-Lane Sync</span>
                <span className="node-sub">
                  {networkCut ? 'OFFLINE (< 10s)' : 'WebSocket Priority 1'}
                </span>
              </div>
            </div>

            <div className={`bridge-packet-track ${networkCut ? 'track-severed' : ''}`}>
              {!networkCut ? (
                <span className="packet packet-horizontal" />
              ) : (
                <span className="severed-cross font-mono">CONNECTION DROPPED</span>
              )}
            </div>
          </div>

          {/* Cloud Column */}
          <div className="diagram-column">
            <span className="column-label font-mono">Cloudflare Edge (Free Tier)</span>

            <div
              className={`arch-node ${activeNode === 'cloud' ? 'node-active' : ''} ${
                networkCut ? 'node-waiting' : ''
              }`}
              onClick={() => setActiveNode('cloud')}
            >
              <div className="node-icon">☁️</div>
              <div className="node-text">
                <span className="node-name">Session Durable Object</span>
                <span className="node-sub">
                  {networkCut ? 'Awaiting Reconnect' : 'SQLite + WS Hibernation'}
                </span>
              </div>
            </div>

            <div className="packet-track track-down">
              {!networkCut ? (
                <span className="packet packet-dot" />
              ) : (
                <span className="packet-idle font-mono">IDLE</span>
              )}
            </div>

            <div
              className={`arch-node ${activeNode === 'ui' ? 'node-active' : ''}`}
              onClick={() => setActiveNode('ui')}
            >
              <div className="node-icon">🖥️</div>
              <div className="node-text">
                <span className="node-name">Web Dashboard (UI)</span>
                <span className="node-sub">SSE Telemetry &amp; Canvas</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Node Detail Inspector: Guarantees vs Non-Guarantees */}
      <Card header={`Node Inspector: ${current.title}`} glowColor="mint">
        <div className="node-inspector-content">
          <div className="inspector-role font-mono">
            <strong>Role:</strong> {current.role}
          </div>

          <div className="inspector-grid">
            <div className="inspector-box box-guarantee">
              <h3 className="box-title text-online">✓ What It GUARANTEES</h3>
              <p className="box-text">{current.guarantee}</p>
            </div>

            <div className="inspector-box box-non-guarantee">
              <h3 className="box-title text-amber">⚠️ What It DOES NOT Guarantee</h3>
              <p className="box-text">{current.nonGuarantee}</p>
            </div>
          </div>

          <div className="inspector-rationale">
            <strong>Systems Engineering Rationale:</strong> {current.rationale}
          </div>
        </div>
      </Card>
    </div>
  );
};
