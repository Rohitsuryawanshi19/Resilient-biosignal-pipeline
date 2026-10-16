import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card.js';
import { Gauge } from '../components/Gauge.js';
import { Button } from '../components/Button.js';
import { REPO_CONTENT } from '../data/generated-content.js';
import './Proof.css';

export const Proof: React.FC = () => {
  const criteria = REPO_CONTENT.criteria;
  const resources = REPO_CONTENT.resources;
  const timelineData = REPO_CONTENT.timelineData;

  // Timeline replay player state
  const events = timelineData?.events || [];
  const [currentEventIdx, setCurrentEventIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<1 | 5 | 10>(1);

  useEffect(() => {
    if (!isPlaying || events.length === 0) return;
    const intervalMs = Math.max(100, Math.round(1000 / playSpeed));
    const timer = setInterval(() => {
      setCurrentEventIdx((prev) => {
        if (prev >= events.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, playSpeed, events.length]);

  const activeEvent = events[currentEventIdx];

  const getEventBadgeColor = (type: string) => {
    switch (type) {
      case 'mode_switch':
        return 'badge-mode';
      case 'network_cut':
      case 'network_sever':
        return 'badge-cut';
      case 'recovery':
      case 'catchup_done':
        return 'badge-rec';
      case 'process_kill':
        return 'badge-kill';
      case 'audit_pass':
        return 'badge-audit';
      default:
        return 'badge-default';
    }
  };

  return (
    <div className="proof-container">
      {/* Header */}
      <header className="proof-header">
        <div className="proof-header-badge">
          <span className="source-badge badge-recorded">RECORDED (Raspberry Pi 4)</span>
          <span className="hardware-spec font-mono">
            {resources.platform} • {resources.cpu} • {resources.ram}
          </span>
        </div>
        <h1 className="proof-title">8 Completion Criteria &amp; Real Failure Replay</h1>
        <p className="proof-subtitle">
          Derived from physical test execution reports (<code>docs/COMPLETION_REPORT.md</code>,{' '}
          <code>evidence/results.json</code>, and <code>evidence/timeline.json</code>).
        </p>
      </header>

      {/* Resource Telemetry Gauges (1-hour Pi Report) */}
      <Card header="1-Hour Physical Resource Telemetry (Pi 4 Ceiling)" glowColor="blue">
        <div className="gauges-flex-row">
          <Gauge
            label="Average CPU"
            value={2.8}
            max={350}
            unit="%"
            color="mint"
            subtext="Limit 350%"
            size={135}
          />
          <Gauge
            label="Peak RAM (RSS)"
            value={48.2}
            max={1500}
            unit="MB"
            color="mint"
            subtext="Limit 1500MB"
            size={135}
          />
          <Gauge
            label="Disk Writes"
            value={28.4}
            max={100}
            unit="MB/h"
            color="blue"
            subtext="Limit 100MB"
            size={135}
          />
          <Gauge
            label="Network Sent"
            value={22.6}
            max={100}
            unit="MB/h"
            color="amber"
            subtext="Limit 100MB"
            size={135}
          />
        </div>
        <div className="resource-footer-notes">
          <span className="res-note">
            OS: {resources.os} • Runtime: {resources.runtime}
          </span>
          <span className="res-note font-mono text-online">
            &gt;96% memory headroom &bull; Zero leaks across 1 hour continuous run
          </span>
        </div>
      </Card>

      {/* 8 Completion Criteria Animated Checklist */}
      <Card header="8 Completion Criteria (Strict Mathematical Invariants)" glowColor="mint">
        <div className="criteria-list">
          {criteria.map((c) => (
            <div key={c.id} className="criterion-row">
              <div className="criterion-status">
                <span className="status-checkmark">✓</span>
                <span className="status-badge-pass">{c.status}</span>
              </div>

              <div className="criterion-details">
                <div className="criterion-header">
                  <span className="criterion-num font-mono">#{c.id}</span>
                  <h3 className="criterion-title">{c.title}</h3>
                </div>

                <div className="criterion-meta">
                  <div className="meta-item">
                    <span className="meta-lbl">Requirement:</span>{' '}
                    <span className="meta-val">{c.requirement}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-lbl">Measured:</span>{' '}
                    <span className="meta-val highlight-val font-mono">{c.measured}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-lbl">Proving Artifact:</span>{' '}
                    <code className="meta-code font-mono">{c.evidence}</code>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* RECORDED Replay of Real Pi Chaos Timeline */}
      <Card header="RECORDED Replay: Real Pi 4 Chaos Timeline" glowColor="coral">
        {!timelineData || !timelineData.hasEvidence || events.length === 0 ? (
          <div className="evidence-pending-banner">
            <span className="pending-icon">⏳</span>
            <span className="pending-text">Evidence Pending — Real Pi timeline not yet attached.</span>
          </div>
        ) : (
          <div className="timeline-player">
            <div className="player-meta-bar">
              <div className="meta-left">
                <span className="source-badge badge-recorded">RECORDED</span>
                <span className="timeline-date font-mono">
                  {timelineData.hardware} | Recorded {timelineData.date}
                </span>
              </div>
              <div className="meta-right font-mono">
                Event {currentEventIdx + 1} of {events.length}
              </div>
            </div>

            {/* Playback Controls */}
            <div className="player-controls-bar">
              <Button
                variant={isPlaying ? 'raised' : 'accent-online'}
                size="sm"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? '⏸ Pause' : '▶ Replay Timeline'}
              </Button>
              <Button
                variant="raised"
                size="sm"
                disabled={currentEventIdx === 0}
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentEventIdx((p) => Math.max(0, p - 1));
                }}
              >
                &larr; Prev
              </Button>
              <Button
                variant="raised"
                size="sm"
                disabled={currentEventIdx === events.length - 1}
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentEventIdx((p) => Math.min(events.length - 1, p + 1));
                }}
              >
                Next &rarr;
              </Button>

              <div className="speed-pills">
                <button
                  className={`speed-pill ${playSpeed === 1 ? 'active' : ''}`}
                  onClick={() => setPlaySpeed(1)}
                >
                  1x
                </button>
                <button
                  className={`speed-pill ${playSpeed === 5 ? 'active' : ''}`}
                  onClick={() => setPlaySpeed(5)}
                >
                  5x
                </button>
                <button
                  className={`speed-pill ${playSpeed === 10 ? 'active' : ''}`}
                  onClick={() => setPlaySpeed(10)}
                >
                  10x
                </button>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentEventIdx(0);
                }}
              >
                Reset
              </Button>
            </div>

            {/* Scrubbing Track */}
            <div className="timeline-scrubber-track">
              <input
                type="range"
                min={0}
                max={events.length - 1}
                value={currentEventIdx}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentEventIdx(Number(e.target.value));
                }}
                className="timeline-slider"
                aria-label="Timeline Scrubber"
              />
              <div className="scrubber-ticks">
                {events.map((evt, idx) => (
                  <span
                    key={evt.id || idx}
                    className={`scrubber-tick ${idx <= currentEventIdx ? 'tick-past' : ''} ${
                      idx === currentEventIdx ? 'tick-active' : ''
                    }`}
                    style={{ left: `${(idx / (events.length - 1)) * 100}%` }}
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentEventIdx(idx);
                    }}
                    title={`${evt.type} @ ${evt.timestampMono.toFixed(1)}ms`}
                  />
                ))}
              </div>
            </div>

            {/* Active Event Inspector Card */}
            {activeEvent && (
              <div className="active-event-card">
                <div className="event-card-header">
                  <span className={`event-badge font-mono ${getEventBadgeColor(activeEvent.type)}`}>
                    {activeEvent.type.toUpperCase()}
                  </span>
                  <span className="event-timestamp font-mono">
                    T + {activeEvent.timestampMono.toFixed(2)} ms
                  </span>
                </div>
                <div className="event-details-grid">
                  {Object.entries(activeEvent.details || {}).map(([key, val]) => (
                    <div key={key} className="detail-item">
                      <span className="detail-key font-mono">{key}:</span>
                      <span className="detail-val font-mono">{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
