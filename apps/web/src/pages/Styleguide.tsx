import React, { useState } from 'react';
import { Button } from '../components/Button.js';
import { ModeToggle } from '../components/ModeToggle.js';
import { SegmentedControl } from '../components/SegmentedControl.js';
import { Badge } from '../components/Badge.js';
import { Card } from '../components/Card.js';
import { Gauge } from '../components/Gauge.js';
import { StatTile } from '../components/StatTile.js';
import { LedgerTile } from '../components/LedgerTile.js';
import { Chip } from '../components/Chip.js';
import { TimelineItem } from '../components/TimelineItem.js';
import { Skeleton } from '../components/Skeleton.js';
import { Toast } from '../components/Toast.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import './Styleguide.css';

export const Styleguide: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mode, setMode] = useState<'online' | 'offline'>('online');
  const [activeSegment, setActiveSegment] = useState<'all' | 'sensor1' | 'sensor2'>('all');
  const [chipList, setChipList] = useState(['Session #01', 'CRC-32 Valid', 'WAL Sync']);
  const [toastDismissed, setToastDismissed] = useState(false);
  const reducedMotion = useReducedMotion();

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <div className="styleguide-page">
      {/* Background Aurora Mesh */}
      <div className="aurora-mesh" aria-hidden="true">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>

      <header className="styleguide-header">
        <div>
          <h1 className="styleguide-title">Spatial Neumorphic Glass Design System</h1>
          <p className="styleguide-subtitle">
            Tokenized UI Components for MayaCardio Bio-Signal Pipeline
          </p>
        </div>
        <div className="header-actions">
          <Button variant="raised" size="sm" onClick={toggleTheme}>
            Theme: {theme.toUpperCase()}
          </Button>
          <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Reduced Motion: {reducedMotion ? 'ON' : 'OFF'}
          </span>
        </div>
      </header>

      <div className="styleguide-grid">
        {/* Section 1: Color Tokens & Typography */}
        <Card header="1. Design Tokens & Typography" glowColor="blue">
          <div className="tokens-demo">
            <div className="color-swatches">
              <div className="swatch">
                <div className="swatch-box" style={{ background: 'var(--accent-online)' }} />
                <div>
                  <div style={{ color: 'var(--text-main)', fontWeight: 700 }}>Online (Mint)</div>
                  <div className="font-mono">#3dffb5</div>
                </div>
              </div>
              <div className="swatch">
                <div className="swatch-box" style={{ background: 'var(--accent-offline)' }} />
                <div>
                  <div style={{ color: 'var(--text-main)', fontWeight: 700 }}>Offline (Amber)</div>
                  <div className="font-mono">#ffb454</div>
                </div>
              </div>
              <div className="swatch">
                <div className="swatch-box" style={{ background: 'var(--accent-loss)' }} />
                <div>
                  <div style={{ color: 'var(--text-main)', fontWeight: 700 }}>Loss (Coral)</div>
                  <div className="font-mono">#ff5c7a</div>
                </div>
              </div>
              <div className="swatch">
                <div className="swatch-box" style={{ background: 'var(--accent-sync)' }} />
                <div>
                  <div style={{ color: 'var(--text-main)', fontWeight: 700 }}>Sync (Blue)</div>
                  <div className="font-mono">#5aa0ff</div>
                </div>
              </div>
            </div>

            <div className="type-samples">
              <p className="type-ui-sample">Space Grotesk — Systems engineering UI typography</p>
              <p className="type-mono-sample font-mono">
                JetBrains Mono — 400 Hz | CRC: 0x8a92f1b4 | 120,400 samples | [0, 400)
              </p>
            </div>
          </div>
        </Card>

        {/* Section 2: Neumorphic Buttons in EVERY state */}
        <Card header="2. Neumorphic Buttons (All States & Variants)" glowColor="mint">
          <div className="buttons-demo">
            <div>
              <h2 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                States: Default, Hover, Pressed, Focus, Disabled, Loading, Error
              </h2>
              <div className="btn-row">
                <Button variant="primary">Default</Button>
                <Button variant="primary" forceState="hover">Hover</Button>
                <Button variant="primary" forceState="pressed">Pressed</Button>
                <Button variant="primary" forceState="focus">Focus</Button>
                <Button variant="primary" disabled>Disabled</Button>
                <Button variant="primary" loading>Loading</Button>
                <Button variant="primary" error>Error</Button>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Variants: Primary (Sync), Secondary (Raised), Danger (Coral/Loss), Magnetic
              </h2>
              <div className="btn-row">
                <Button variant="primary" magnetic>Primary (Magnetic)</Button>
                <Button variant="secondary" magnetic>Secondary (Raised)</Button>
                <Button variant="danger">Danger (Loss)</Button>
                <Button variant="accent-online">Accent Online</Button>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Sizes: Small, Medium, Large
              </h2>
              <div className="btn-row">
                <Button size="sm">Small (sm)</Button>
                <Button size="md">Medium (md)</Button>
                <Button size="lg">Large (lg)</Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Section 3: Mode Toggle */}
        <Card header="3. Mode Toggle (Spring Physics + Color Morph + ARIA Live)" glowColor="amber">
          <div className="toggle-demo">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Interactive:
                </span>
                <ModeToggle mode={mode} onChange={setMode} />
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Offline State:
                </span>
                <ModeToggle mode="offline" onChange={() => {}} />
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Disabled State:
                </span>
                <ModeToggle mode="online" onChange={() => {}} disabled />
              </div>
            </div>
            <p className="toggle-state-text" style={{ marginTop: '12px' }}>
              Active Mode: <strong className="font-mono">{mode.toUpperCase()}</strong>
            </p>
          </div>
        </Card>

        {/* Section 4: Segmented Control */}
        <Card header="4. Segmented Control (Sliding Active Backdrop + Keyboard Navigation)" glowColor="blue">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                Interactive Channel Selector:
              </span>
              <SegmentedControl
                options={[
                  { value: 'all', label: 'All Channels' },
                  { value: 'sensor1', label: 'Sensor 1 (3 Ch)' },
                  { value: 'sensor2', label: 'Sensor 2 (2 Ch)' },
                ]}
                value={activeSegment}
                onChange={setActiveSegment}
              />
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                Disabled State:
              </span>
              <SegmentedControl
                options={[
                  { value: 'live', label: 'Live' },
                  { value: 'paused', label: 'Paused' },
                ]}
                value="live"
                onChange={() => {}}
                disabled
              />
            </div>
          </div>
        </Card>

        {/* Section 5: Data Source Badges */}
        <Card header="5. Data Source Badges (Distinct Icon + Color + Label)" glowColor="mint">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
            <Badge type="live" label="LIVE" detail="Browser Engine + Cloud DO" />
            <Badge type="simulation" label="SIMULATION" detail="Browser Mock" />
            <Badge type="recorded" label="RECORDED" detail="Raspberry Pi 4 • 2026-10-15" />
            <Badge type="live" size="sm" />
            <Badge type="simulation" size="sm" />
            <Badge type="recorded" size="sm" />
          </div>
        </Card>

        {/* Section 6: Knob Gauges */}
        <Card header="6. Hardware Resource Gauges (Knob Dials + Animated Needle + Count-Up)" glowColor="coral">
          <div className="gauges-demo">
            <Gauge
              label="CPU Utilization"
              value={32.4}
              max={100}
              unit="%"
              color="mint"
              subtext="4 Cores Avg"
              sparklineData={[12, 18, 25, 42, 38, 29, 32, 35, 31, 32.4]}
            />
            <Gauge
              label="Peak Memory (RSS)"
              value={48.2}
              max={1500}
              unit="MB"
              color="blue"
              subtext="Pi 4 (2GB RAM)"
              sparklineData={[30, 35, 41, 45, 47, 48.2]}
            />
            <Gauge
              label="Disk Write Rate"
              value={14.8}
              max={50}
              unit="KB/s"
              color="amber"
              subtext="WAL FULL fsync"
              sparklineData={[8, 12, 16, 22, 19, 14.8]}
            />
            <Gauge
              label="Packet Drop / Loss"
              value={0}
              max={10}
              unit="%"
              color="coral"
              subtext="Zero Dropped"
              sparklineData={[0, 0, 0, 0, 0]}
            />
          </div>
        </Card>

        {/* Section 7: Stat Tiles with Count-up & Delta */}
        <Card header="7. Stat Tiles (Count-Up Numbers + Delta Indicators)" glowColor="blue">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <StatTile
              label="Samples Processed"
              value={144000}
              unit="pts"
              delta={{ value: 12.5, unit: '%' }}
              color="mint"
              subtext="At 400 Hz steady state"
            />
            <StatTile
              label="Mean Heart Rate"
              value={72.4}
              unit="BPM"
              decimals={1}
              delta={{ value: -1.2, unit: 'BPM', isPositiveGood: true }}
              color="blue"
              subtext="Normal sinus rhythm"
            />
            <StatTile
              label="Unrecovered Loss"
              value={0}
              unit="pts"
              delta={{ value: 0, unit: '%' }}
              color="coral"
              subtext="Audit: 100% accounted"
            />
            <StatTile
              label="Catch-Up Backlog"
              value={12}
              unit="blocks"
              delta={{ value: 4, unit: ' blk', isPositiveGood: false }}
              color="amber"
              subtext="Drain rate: 45 blk/s"
            />
          </div>
        </Card>

        {/* Section 8: Ledger Tiles */}
        <Card header="8. Ledger Tiling Strip (Stored, Lost with Reason, Pending-Sync, Empty)" glowColor="mint">
          <div className="tiles-demo">
            <p className="tiles-desc">
              Hover tiles to inspect range, sensor, count, and honest loss reason:
            </p>
            <div className="tiles-lane">
              <span className="lane-label font-mono">Device:</span>
              <div className="tiles-row">
                <LedgerTile status="stored" sensor={1} fromIndex={0} toIndex={400} count={400} />
                <LedgerTile status="stored" sensor={1} fromIndex={400} toIndex={800} count={400} />
                <LedgerTile status="stored" sensor={1} fromIndex={800} toIndex={1200} count={400} />
                <LedgerTile
                  status="lost"
                  sensor={1}
                  fromIndex={1200}
                  toIndex={1600}
                  count={400}
                  reason="crc_mismatch_unrecoverable"
                />
                <LedgerTile status="stored" sensor={1} fromIndex={1600} toIndex={2000} count={400} />
                <LedgerTile status="stored" sensor={1} fromIndex={2000} toIndex={2400} count={400} />
                <LedgerTile status="pending-sync" sensor={1} fromIndex={2400} toIndex={2800} count={400} />
                <LedgerTile status="pending-sync" sensor={1} fromIndex={2800} toIndex={3200} count={400} />
              </div>
            </div>

            <div className="tiles-lane">
              <span className="lane-label font-mono">Cloud:</span>
              <div className="tiles-row">
                <LedgerTile status="stored" sensor={1} fromIndex={0} toIndex={400} count={400} />
                <LedgerTile status="stored" sensor={1} fromIndex={400} toIndex={800} count={400} />
                <LedgerTile status="stored" sensor={1} fromIndex={800} toIndex={1200} count={400} />
                <LedgerTile
                  status="lost"
                  sensor={1}
                  fromIndex={1200}
                  toIndex={1600}
                  count={400}
                  reason="crc_mismatch_unrecoverable"
                />
                <LedgerTile status="stored" sensor={1} fromIndex={1600} toIndex={2000} count={400} />
                <LedgerTile status="stored" sensor={1} fromIndex={2000} toIndex={2400} count={400} />
                <LedgerTile status="empty" sensor={1} fromIndex={2400} toIndex={2800} count={400} />
                <LedgerTile status="empty" sensor={1} fromIndex={2800} toIndex={3200} count={400} />
              </div>
            </div>

            <div className="tiles-legend">
              <div className="legend-item">
                <span className="legend-box" style={{ background: 'var(--accent-online)' }} />
                <span>Stored (Durable SQLite)</span>
              </div>
              <div className="legend-item">
                <span className="legend-box" style={{ background: 'var(--accent-loss)' }} />
                <span>Lost (Honest Reason)</span>
              </div>
              <div className="legend-item">
                <span className="legend-box" style={{ background: 'var(--accent-sync)' }} />
                <span>Pending Sync (Diff Queue)</span>
              </div>
              <div className="legend-item">
                <span className="legend-box" style={{ background: 'var(--surface-border)' }} />
                <span>Pending Cloud Catch-up</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Section 9: Chips */}
        <Card header="9. Chips (Variants, Removable, States)" glowColor="blue">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <Chip label="Default Chip" />
              <Chip label="Online Status" variant="online" />
              <Chip label="Offline Mode" variant="offline" />
              <Chip label="CRC Loss" variant="loss" />
              <Chip label="Syncing" variant="sync" />
              <Chip label="Disabled Chip" disabled />
            </div>

            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                Removable Chips (Interactive):
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {chipList.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    variant="sync"
                    onRemove={() => setChipList(chipList.filter((item) => item !== c))}
                  />
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Section 10: Timeline Items */}
        <Card header="10. Audit & Event Timeline (Mode Switches & Fault Traces)" glowColor="amber">
          <div role="list">
            <TimelineItem
              status="online"
              title="System Online — Real-Time WebSocket Streaming"
              timestamp="10:42:01.200"
              description="WebSocket handshake verified. Streaming 400 Hz blocks directly to Cloudflare Durable Object with sub-5s result latency."
            />
            <TimelineItem
              status="loss"
              title="CRC-32 Checksum Mismatch Detected"
              timestamp="10:42:15.840"
              description="Corrupted block discarded. 3 TCP retries exhausted; recorded honest loss interval [1200, 1600) with reason: crc_mismatch_unrecoverable."
            />
            <TimelineItem
              status="offline"
              title="Network Severed — Mode Flipped to Offline"
              timestamp="10:42:18.100"
              description="Network heartbeat timed out in <10s. Mode toggled to Offline. All incoming frames routed to local SQLite WAL with synchronous=FULL."
            />
            <TimelineItem
              status="sync"
              title="Network Restored — Batched Catch-Up Sync"
              timestamp="10:44:02.500"
              description="Cloud /state handshake returned missing range [1600, 3200). Gzip-compressed sync completed in 1.4s."
              isLast
            />
          </div>
        </Card>

        {/* Section 11: Skeletons & Placeholders */}
        <Card header="11. Skeletons (Shimmer Placeholders)" glowColor="blue">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Skeleton variant="circular" width={48} height={48} />
              <div style={{ flex: 1 }}>
                <Skeleton variant="text" width="60%" height={16} />
                <Skeleton variant="text" width="90%" height={12} />
              </div>
            </div>
            <Skeleton variant="rectangular" height={80} />
          </div>
        </Card>

        {/* Section 12: Toast Notifications */}
        <Card header="12. Toast Notifications (Success, Warning, Error, Info)" glowColor="mint">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {!toastDismissed && (
              <Toast
                type="success"
                title="Sync Completed Successfully"
                message="120,000 samples matched between Raspberry Pi and Cloudflare SQLite ledger."
                onDismiss={() => setToastDismissed(true)}
              />
            )}
            <Toast
              type="warning"
              title="Network Latency Spike Detected"
              message="Round-trip time exceeded 850ms. Local write buffers engaged."
            />
            <Toast
              type="error"
              title="Simulated Fault Injected"
              message="TCP proxy injected 20% packet corruption on sensor 1 port."
            />
            <Toast
              type="info"
              title="Auditor Invariant Check"
              message="Invariant stored ∩ lost = ∅ strictly verified across 360 windows."
            />
          </div>
        </Card>
      </div>
    </div>
  );
};
