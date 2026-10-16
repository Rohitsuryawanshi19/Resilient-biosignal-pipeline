# AI Usage & Transparency Disclosure

This document discloses all uses of Artificial Intelligence across development and runtime operations.

---

## 1. Development & Engineering Workflow

During development, the following tools were utilized:
- **Google DeepMind Antigravity & Gemini 2.5 Pro / Flash**:
  - Accelerated initial scaffolding of TypeScript types, SQLite DDL schemas, and configuration templates.
  - Generated unit test permutations and `fast-check` random input arbitraries.
  - Formatted Markdown reporting tables.

### What Was Engineered & Verified By Hand:
- All core mathematics: immutable interval algebra (`union`, `subtract`, `intersect`, `complement`), double-entry ledger invariants (`stored ∩ lost = ∅`), and $O(1)$ streaming circular buffer lookback.
- The `round1()` half-away-from-zero floating-point implementation.
- SQLite WAL commit-before-advance protocol with `PRAGMA synchronous=FULL` and 64 MB reserve file ENOSPC recovery.
- Monotonic clock isolation (`performance.now()`) ensuring immunity to wall-clock shifts.
- Isolation and fixes for all 6 edge bugs documented in `docs/BUGS_FOUND.md`.

---

## 2. Runtime Feature: Optional AI Operations Explainer

An optional, off-path event explainer is integrated into the Cloudflare Worker:
- **Purpose**: Generates 2-sentence plain-English summaries when a loss record or mode transition occurs.
- **Provider & Model**: **Google Gemini 2.5 Flash (Free Tier)**.
- **Cost**: **$0.00** (Free of charge; no paid tiers used).
- **Verified Free Quota Limits**:
  - 15 Requests Per Minute (RPM)
  - 1,000,000 Tokens Per Minute (TPM)
  - 1,500 Requests Per Day (RPD)

### Critical Architectural Guardrails:
1. **Completely Off the Critical Path**:
   - The streaming ingest, SQLite WAL storage, sync protocol, and mathematical window results **never await or depend on** the Gemini API.
   - All AI calls are dispatched in background non-blocking tasks (`ctx.waitUntil`).
2. **Strict Hallucination Barrier (Zero Unverified Numbers)**:
   - Input to the LLM consists solely of structured ledger facts (`sensor`, `from`, `to`, `count`, `reason`).
   - The LLM is instructed never to produce numbers not found in the input.
   - **Template Validator**: Every number in the generated response is checked against the input facts. If any unrecognized number appears (e.g. hallucinated "99%", "50ms"), the output is immediately rejected and replaced with a deterministic, safe template string.
3. **Graceful Silent Degradation**:
   - If `GEMINI_API_KEY` is not configured, or if the free quota is exhausted (HTTP 429), the feature degrades silently to the deterministic template or disappears from the UI without throwing errors.
4. **Rate Limiting & Caching**:
   - Throttled to $\le 15$ requests/minute with a 4-second minimum interval.
   - In-memory event signature cache prevents duplicate queries for identical loss or mode change patterns.
5. **UI Transparency**:
   - In the web dashboard, summaries are prominently labeled **"AI-GENERATED SUMMARY"** with the source chip (`Gemini 2.5 Flash Free Tier` or `Deterministic Safe Template`) and a `✓ Numbers Verified` badge.
