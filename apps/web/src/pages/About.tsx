import React from 'react';
import { Card } from '../components/Card.js';
import { Button } from '../components/Button.js';
import './About.css';

export const About: React.FC = () => {
  return (
    <div className="about-container">
      <header className="about-header">
        <h1 className="about-title">About MayaCardio &amp; AI Transparency</h1>
        <p className="about-subtitle">
          Designed and verified for clinical-grade reliability, low-level efficiency, and zero data loss.
        </p>
      </header>

      {/* Systems Engineering Resume Profile */}
      <Card header="Systems Engineering Profile & Core Philosophy" glowColor="mint">
        <div className="about-profile">
          <p className="profile-text">
            This project demonstrates how a systems engineer designs, implements, and verifies
            high-throughput medical biosignal streaming under adversarial real-world constraints:
            unreliable edge networks, abrupt power cuts, corrupt packets, limited disk space, and zero-dollar cloud cost ceilings.
          </p>

          <div className="profile-highlights">
            <div className="profile-highlight">
              <span className="hl-title font-mono">Low-Level Durability</span>
              <span className="hl-desc">Atomic SQLite WAL fsync per 1-second block; 64 MB emergency reserve file for crash-safety.</span>
            </div>
            <div className="profile-highlight">
              <span className="hl-title font-mono">Pure Mathematics</span>
              <span className="hl-desc">Double-entry interval ledger algebra (S &cap; L = &empty;); strictly bounded O(1) circular buffers.</span>
            </div>
            <div className="profile-highlight">
              <span className="hl-title font-mono">Edge Cloud Cost</span>
              <span className="hl-desc">1-second int24 BLOB packing fits 100% within Cloudflare Workers Free Tier limits.</span>
            </div>
          </div>
        </div>
      </Card>

      {/* AI Transparency Disclosure (AI_USAGE.md) */}
      <Card header="AI Tools Disclosure & Verification Protocol (AI_USAGE.md)" glowColor="blue">
        <div className="ai-disclosure-content">
          <div className="disclosure-block">
            <h3 className="block-title">1. Development-Time AI Assistance</h3>
            <p className="block-text">
              <strong>Google DeepMind Antigravity</strong> and <strong>Gemini 2.5 Pro / Flash</strong> were used as pair-programming assistants to accelerate typing boilerplate, scaffold interface skeletons, and format Markdown test reports.
            </p>
            <p className="block-text">
              <strong>All core algorithms and safety mechanisms were engineered and verified by hand:</strong>
            </p>
            <ul className="disclosure-list">
              <li>Normalized interval algebra (union, subtract, intersect, complement).</li>
              <li>O(1) memory ring buffer peak detection and float-accurate half-away-from-zero <code>round1()</code>.</li>
              <li>SQLite WAL commit-before-advance protocol and emergency disk recovery.</li>
              <li>Monotonic clock decoupling ensuring immunity to system wall-clock shifts.</li>
              <li>All 6 root-cause bug fixes documented in <code>docs/BUGS_FOUND.md</code>.</li>
            </ul>
          </div>

          <div className="disclosure-block">
            <h3 className="block-title">2. Runtime Gemini API Free Tier (Completely Off Critical Path)</h3>
            <p className="block-text">
              An optional, off-path event explainer uses <code>gemini-2.5-flash</code> (Free Tier: 15 RPM, 1,500 RPD, $0.00 cost).
            </p>
            <ul className="disclosure-list">
              <li><strong>Zero pipeline dependency:</strong> Streaming ingest and results never await or block on Gemini.</li>
              <li><strong>Zero number hallucinations:</strong> Every number in the generated explanation is validated against input facts; unverified numbers are rejected and replaced with deterministic templates.</li>
              <li><strong>Graceful fail-open:</strong> If API key or quota is missing, the feature degrades silently.</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Tech Stack Matrix */}
      <Card header="Full Technology Stack & Zero-External-Dependency Philosophy" glowColor="amber">
        <div className="tech-stack-grid">
          <div className="tech-item">
            <span className="tech-name font-mono">Edge Pipeline</span>
            <span className="tech-desc">Bun runtime, bun:sqlite (WAL mode), pure TypeScript, compiled standalone binary for ARM64.</span>
          </div>
          <div className="tech-item">
            <span className="tech-name font-mono">DSP Engine</span>
            <span className="tech-desc"><code>@mayacardio/core</code> zero-dependency math package, O(1) circular buffers, fast-check property tests.</span>
          </div>
          <div className="tech-item">
            <span className="tech-name font-mono">Cloud Backend</span>
            <span className="tech-desc">Cloudflare Workers, Durable Objects, SQLite edge storage, WebSocket Hibernation API.</span>
          </div>
          <div className="tech-item">
            <span className="tech-name font-mono">Web UI & Lab</span>
            <span className="tech-desc">Vite, React 19, Motion springs, 60fps HTML5 Canvas ECG, IndexedDB strict durability adapter.</span>
          </div>
        </div>
      </Card>

      {/* Candidate Contact & Repository Card */}
      <Card header="Repository, Artifacts & Contact" glowColor="mint">
        <div className="contact-card-content">
          <div className="contact-row">
            <a
              href="https://github.com/Rohitsuryawanshi19/Resilient-biosignal-pipeline"
              target="_blank"
              rel="noreferrer"
              className="neu-btn neu-btn-accent-sync neu-btn-md"
            >
              GitHub Repository &rarr;
            </a>
            <div className="binary-pill font-mono">
              <span>Linux-ARM64 Binary:</span>
              <code>./pipeline-linux-arm64</code>
            </div>
          </div>

          <div className="license-info">
            <span className="license-badge font-mono">MIT LICENSE</span>
            <span className="license-text">
              Open-source medical telemetry reference implementation. Free for clinical evaluation and academic research.
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
};
