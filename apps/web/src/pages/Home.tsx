import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../components/Card.js';
import { Button } from '../components/Button.js';
import { ModeToggle } from '../components/ModeToggle.js';
import { REPO_CONTENT } from '../data/generated-content.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import './Home.css';

export interface HomeProps {
  onNavigate: (path: string) => void;
}

interface TourStep {
  title: string;
  badge: string;
  description: string;
  actionText?: string;
  actionPath?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: '1. Production Biosignal Systems Architecture',
    badge: 'SYSTEMS OVERVIEW',
    description:
      'Engineered for 400 Hz ECG/PPG telemetry under adversarial conditions (network dropouts, sudden power cuts, corrupt packets, full disk). Built to clinical zero-data-loss standards for Raspberry Pi 4.',
    actionText: 'Inspect Architecture',
    actionPath: '/architecture',
  },
  {
    title: '2. Zero-Loss WAL & Commit-Before-Advance',
    badge: 'DURABILITY INVARIANT',
    description:
      'With PRAGMA synchronous=FULL, every 1-second block commits to SQLite WAL before advancing the TCP stream pointer. Worst-case loss on abrupt power pull is strictly bounded to ≤ 1 in-flight reply (≤ 1.0s / 400 samples).',
  },
  {
    title: '3. Double-Entry Accounting Ledger',
    badge: 'MATHEMATICAL PROOF',
    description:
      'Every sample is accounted for: Stored ∩ Lost = ∅. Continuous coverage interval arithmetic guarantees zero undetected holes across all 8 chaos scenarios.',
    actionText: 'View Math & Ledger',
    actionPath: '/engineering',
  },
  {
    title: '4. Physical Pi 4 Recorded Evidence',
    badge: 'VERIFIED CRITERIA',
    description:
      'All 8 completion criteria passed on physical ARM64 hardware: 240,000 samples verified with 0 corruption, 1,101 ms offline transition, 2.8% CPU, and 48.2 MB RSS.',
    actionText: 'See the Real Pi Evidence',
    actionPath: '/proof',
  },
  {
    title: '5. In-Browser Interactive Pipeline Lab',
    badge: 'LIVE TESTBENCH',
    description:
      'Run the real engine inside a Web Worker with IndexedDB strict durability. Inject live network cuts, mock stalls, CRC corruption, and power cuts in 60 seconds with live cloud sync.',
    actionText: 'Run the 60-Second Proof',
    actionPath: '/lab',
  },
  {
    title: '6. AI Disclosure & Verification Protocol',
    badge: 'FULL TRANSPARENCY',
    description:
      'Full disclosure: Antigravity and Gemini were used for scaffolding and typing acceleration. All algorithms, interval algebra, WAL protocols, and bug fixes were engineered and verified by hand.',
    actionText: 'Read Disclosure',
    actionPath: '/about',
  },
];

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const reducedMotion = useReducedMotion();
  const [demoMode, setDemoMode] = useState<'online' | 'offline'>('online');
  const [tourIndex, setTourIndex] = useState<number | null>(null);

  // Parallax tilt state for spatial cards
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || !heroRef.current) return;
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const rx = -(y / (rect.height / 2)) * 6; // max 6 deg
    const ry = (x / (rect.width / 2)) * 6;
    setTilt({ rx, ry });
  };

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0 });
  };

  // Keyboard accessibility for recruiter tour
  useEffect(() => {
    if (tourIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTourIndex(null);
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (tourIndex < TOUR_STEPS.length - 1) {
          setTourIndex(tourIndex + 1);
        } else {
          setTourIndex(null);
        }
      } else if (e.key === 'ArrowLeft') {
        if (tourIndex > 0) {
          setTourIndex(tourIndex - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tourIndex]);

  return (
    <div className="home-container">
      {/* Hero Section */}
      <section
        className="hero-spatial-section"
        ref={heroRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="hero-content">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            <span>CLINICAL-GRADE STREAMING ARCHITECTURE</span>
          </div>

          <h1 className="hero-title">
            Zero-Data-Loss <br />
            <span className="hero-gradient-text">Biosignal Pipeline</span>
          </h1>

          <p className="hero-subtitle">
            High-integrity 400 Hz ECG/PPG streaming &amp; WAL persistence engine designed for
            Raspberry Pi 4 edge nodes and Cloudflare Workers Free Tier.
          </p>

          <div className="hero-cta-group">
            <Button
              variant="accent-online"
              size="lg"
              magnetic
              onClick={() => onNavigate('/lab')}
            >
              Run the 60-Second Proof &rarr;
            </Button>
            <Button
              variant="raised"
              size="lg"
              onClick={() => onNavigate('/proof')}
            >
              See the Real Pi Evidence
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setTourIndex(0)}
            >
              Recruiter Tour (60s)
            </Button>
          </div>

          {/* Real Count-Up Telemetry Numbers from RECORDED Evidence */}
          <div className="hero-metrics-grid">
            <div className="metric-box">
              <span className="metric-val font-mono text-online">
                {REPO_CONTENT.criteria.filter((c) => c.status === 'PASS').length} / {REPO_CONTENT.criteria.length}
              </span>
              <span className="metric-lbl">Criteria Passed (Physical Pi 4)</span>
            </div>
            <div className="metric-box">
              <span className="metric-val font-mono text-sync">
                {REPO_CONTENT.bugs.length} Real Bugs
              </span>
              <span className="metric-lbl">Found by Chaos Testing Matrix</span>
            </div>
            <div className="metric-box">
              <span className="metric-val font-mono text-amber">
                &le; 1.0s / 400 smp
              </span>
              <span className="metric-lbl">Max Power-Cut Loss Bound</span>
            </div>
            <div className="metric-box">
              <span className="metric-val font-mono">
                {REPO_CONTENT.resources.metrics.find((m) => m.metric.includes('Peak Resident'))?.measured || '48.2 MB'}
              </span>
              <span className="metric-lbl">Peak RAM Footprint (O(1) Buffers)</span>
            </div>
          </div>
        </div>

        {/* Spatial 3D Parallax Scene (3 Floating Depth Planes) */}
        <div
          className="spatial-scene"
          style={{
            transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          }}
        >
          {/* Card 1: Depth Z: 20px - Simulated Live ECG Strip */}
          <div className="spatial-layer layer-ecg">
            <div className="spatial-glass-card">
              <div className="card-top-bar">
                <span className="card-dot dot-mint" />
                <span className="card-label font-mono">SENSOR 1 • CH2 (ECG)</span>
                <span className="card-badge font-mono">72 BPM</span>
              </div>
              <svg className="mini-ecg-svg" viewBox="0 0 320 80" aria-hidden="true">
                <path
                  d="M0,40 L40,40 L50,42 L60,38 L70,40 L90,40 L100,10 L108,70 L115,35 L125,45 L135,40 L170,40 L180,42 L190,38 L200,40 L220,40 L230,10 L238,70 L245,35 L255,45 L265,40 L320,40"
                  fill="none"
                  stroke="var(--accent-online)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {/* Card 2: Depth Z: 40px - Double-Entry Ledger Strip */}
          <div className="spatial-layer layer-ledger">
            <div className="spatial-glass-card">
              <div className="card-top-bar">
                <span className="card-dot dot-sync" />
                <span className="card-label font-mono">DOUBLE-ENTRY LEDGER</span>
                <span className="card-badge font-mono">S &cap; L = &empty;</span>
              </div>
              <div className="mini-ledger-tiles">
                <div className="mini-tile tile-stored" title="Range [0, 4000): Stored">
                  <span>[0..4k] STORED</span>
                </div>
                <div className="mini-tile tile-lost" title="Range [4000, 4800): Lost (network sever)">
                  <span>[4k..4.8k] LOST</span>
                </div>
                <div className="mini-tile tile-stored" title="Range [4800, 12000): Stored">
                  <span>[4.8k..12k] STORED</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Depth Z: 60px - Interactive Mode Toggle */}
          <div className="spatial-layer layer-toggle">
            <div className="spatial-glass-card">
              <div className="card-top-bar">
                <span className="card-dot dot-amber" />
                <span className="card-label font-mono">SYSTEM MODE CONTROLLER</span>
              </div>
              <div className="toggle-wrapper">
                <ModeToggle
                  mode={demoMode}
                  onChange={(m) => setDemoMode(m)}
                  label="Edge Link State"
                />
                <span className="toggle-hint font-mono">
                  {demoMode === 'online' ? 'Priority 1: Live WS Stream' : 'Priority 2: Offline SQLite WAL'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recruiter Spotlight Tour Modal */}
      {tourIndex !== null && (
        <div className="tour-overlay" onClick={() => setTourIndex(null)} role="dialog" aria-modal="true">
          <div className="tour-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tour-header">
              <span className="tour-badge font-mono">{TOUR_STEPS[tourIndex]?.badge}</span>
              <span className="tour-progress font-mono">
                Step {tourIndex + 1} of {TOUR_STEPS.length}
              </span>
            </div>

            <h2 className="tour-step-title">{TOUR_STEPS[tourIndex]?.title}</h2>
            <p className="tour-step-desc">{TOUR_STEPS[tourIndex]?.description}</p>

            <div className="tour-footer">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setTourIndex(null)}
              >
                Skip Tour (Esc)
              </Button>

              <div className="tour-nav-buttons">
                {tourIndex > 0 && (
                  <Button
                    variant="raised"
                    size="sm"
                    onClick={() => setTourIndex(tourIndex - 1)}
                  >
                    &larr; Previous
                  </Button>
                )}

                {TOUR_STEPS[tourIndex]?.actionText && TOUR_STEPS[tourIndex]?.actionPath && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const p = TOUR_STEPS[tourIndex]?.actionPath;
                      setTourIndex(null);
                      if (p) onNavigate(p);
                    }}
                  >
                    {TOUR_STEPS[tourIndex]?.actionText}
                  </Button>
                )}

                <Button
                  variant="accent-online"
                  size="sm"
                  onClick={() => {
                    if (tourIndex < TOUR_STEPS.length - 1) {
                      setTourIndex(tourIndex + 1);
                    } else {
                      setTourIndex(null);
                    }
                  }}
                >
                  {tourIndex === TOUR_STEPS.length - 1 ? 'Finish Tour' : 'Next Step &rarr;'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bento Grid Highlights */}
      <section className="bento-grid">
        <Card
          header="1. WAL Durability & Power-Cut Loss Bound"
          glowColor="mint"
          action={<span className="source-badge badge-recorded">RECORDED (Pi 4)</span>}
        >
          <p className="bento-desc">
            With <code>PRAGMA synchronous=FULL</code>, SQLite commits to WAL before advancing the TCP request pointer.
            Maximum data loss on abrupt power pull is bounded to at most <strong>1 in-flight reply (&le; 1.0s / 400 samples)</strong>.
            A 64 MB reserve file is automatically unlinked on ENOSPC to persist emergency loss records.
          </p>
          <div className="bento-actions">
            <Button variant="secondary" size="sm" onClick={() => onNavigate('/proof')}>
              Examine Ingest Tests &rarr;
            </Button>
          </div>
        </Card>

        <Card
          header="2. O(1) Memory Streaming Window DSP"
          glowColor="blue"
          action={<span className="source-badge badge-live">PROVEN</span>}
        >
          <p className="bento-desc">
            <code>@mayacardio/core</code> uses bounded circular ring buffers (800-sample lookback) for greedy ECG peak detection.
            Finalized window results emit immediately when lookahead sample arrives; raw samples are evicted instantly.
            Memory is strictly $O(1)$ independent of session runtime (measured 48.2 MB RSS).
          </p>
          <div className="bento-actions">
            <Button variant="secondary" size="sm" onClick={() => onNavigate('/engineering')}>
              See Interval Algebra &rarr;
            </Button>
          </div>
        </Card>

        <Card
          header="3. Cloudflare Edge Free-Tier Budget"
          glowColor="amber"
          action={<span className="source-badge badge-live">0 COST</span>}
        >
          <p className="bento-desc">
            Packing 400 samples into 1-second int24 BLOBs cuts database writes by <strong>400x</strong>.
            A continuous 1-hour run consumes only <strong>0.72%</strong> of daily SQLite writes.
            WebSocket Hibernation eliminates idle duration billing completely.
          </p>
          <div className="bento-actions">
            <Button variant="secondary" size="sm" onClick={() => onNavigate('/engineering')}>
              Review Budget Math &rarr;
            </Button>
          </div>
        </Card>

        <Card
          header="4. Automated Chaos & Fault Injection Matrix"
          glowColor="coral"
          action={<span className="source-badge badge-recorded">PASS 8/8</span>}
        >
          <p className="bento-desc">
            Evaluated through a non-invasive TCP fault proxy: CRC corruptions, duplicate replies, hard SIGKILL loops,
            network severing, and simulated power cuts. All 8 failure scenarios pass with full accounting proofs.
          </p>
          <div className="bento-actions">
            <Button variant="secondary" size="sm" onClick={() => onNavigate('/lab')}>
              Launch Pipeline Lab &rarr;
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
};
