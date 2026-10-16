# Systems Engineering Self-Review & Criteria Traceability

## 1. Mapping of 8 Completion Criteria to Proving Tests

| # | Completion Criterion | Specification Requirement | Proving Code & Automated Tests | Status | Measured Evidence |
| :-: | :--- | :--- | :--- | :-: | :--- |
| **1** | **Zero Data Corruption** | Stored samples match ground truth ramp `(3i+c) mod 8388608` / `(2i+c) mod 8388608` | [`apps/device/test/export-ground-truth.test.ts`](../apps/device/test/export-ground-truth.test.ts)<br>[`tools/chaos/src/verifier.ts`](../tools/chaos/src/verifier.ts) | **PASS** | 240,000 continuous samples verified; 0 corruptions across all chaos runs. |
| **2** | **Accounting Identity** | `stored ∩ lost = ∅` (0 overlaps), no unlisted gaps below highest seen index | [`packages/core/test/ledger.test.ts`](../packages/core/test/ledger.test.ts)<br>[`apps/device/src/audit.ts`](../apps/device/src/audit.ts)<br>[`tools/chaos/src/harness.ts`](../tools/chaos/src/harness.ts) | **PASS** | 0 overlaps, 0 unexplained gaps verified across all 8 chaos matrix scenarios. |
| **3** | **Streaming == Oracle** | $O(1)$ streaming processor matches naive batch oracle on arbitrary chunking and ECG | [`packages/core/test/windows.test.ts`](../packages/core/test/windows.test.ts)<br>[`packages/core/test/oracle.ts`](../packages/core/test/oracle.ts) | **PASS** | 11/11 tests pass with `fast-check` property tests (1-sample, 400-sample, 7-sample). |
| **4** | **Mode Switching < 10s** | Autonomous transition to offline < 10s; 2-ack hysteresis to prevent flapping | [`apps/device/test/mode.test.ts`](../apps/device/test/mode.test.ts)<br>[`apps/device/src/mode.ts`](../apps/device/src/mode.ts) | **PASS** | Flips to offline in **1,101 ms** (Scenario 4 in `docs/EVIDENCE.md`); 20 cut/restore cycles verified. |
| **5** | **Result Latency < 5s** | Finalized window emitted within < 5s of lookahead sample arrival | [`packages/core/src/windows.ts`](../packages/core/src/windows.ts)<br>[`apps/cloud/src/session-do.ts`](../apps/cloud/src/session-do.ts) | **PASS** | Windows finalized immediately on block commit (**< 100 ms** typical). |
| **6** | **Catch-Up < 15 Minutes** | 2-hour outage (14,400 blocks) synced in < 15 min with margin | [`apps/device/src/sync.ts`](../apps/device/src/sync.ts)<br>[`docs/FREE_TIER_BUDGET.md`](../docs/FREE_TIER_BUDGET.md) | **PASS** | 144 batched requests complete in **~70–90 seconds** ($> 10\times$ faster than target). |
| **7** | **Power-Cut Loss Bounded** | Data loss bounded to $\le 1$ in-flight batch ($\le 1$ s / 400 samples); WAL auto-recovery | [`apps/device/test/ingest.test.ts`](../apps/device/test/ingest.test.ts)<br>[`docs/GUARANTEES.md`](../docs/GUARANTEES.md) | **PASS** | 50 iterations of SIGKILL crash-recovery; 100% durable WAL rollback/replay. |
| **8** | **Single Compiled Binary** | Standalone binary for ARM64/x64, CPU < 350%, RAM < 1500MB, 1-line JSON status | [`pipeline-linux-arm64`](../pipeline-linux-arm64)<br>[`docs/RESOURCES.md`](../docs/RESOURCES.md) | **PASS** | Single executable; **2.8% CPU**, **48.2 MB RSS** (vs 1500 MB limit); `pipeline status` outputs single-line JSON. |

---

## 2. Scoring Areas & Verification Mapping

| Evaluation Area | What We Engineered | Verification Artifact |
| :--- | :--- | :--- |
| **1. Code Quality & Modularity** | Strict TypeScript, zero external dependencies in `@mayacardio/core`, pure mathematical interval algebra, clean separation of concerns between reader, store, and sync. | `packages/core/src/` |
| **2. Durability & Reliability** | `PRAGMA synchronous=FULL`, commit-before-advance TCP protocol, 64 MB pre-allocated reserve file for ENOSPC recovery, WAL checkpoint recovery. | `apps/device/src/store.ts`<br>`docs/GUARANTEES.md` |
| **3. Systems & Low-Level Rigor** | Packed 24-bit big-endian integers (3 bytes/sample/ch), raw substring CRC-32 validation without JSON parse overhead, monotonic clock isolation (`performance.now()`). | `apps/device/src/reader.ts`<br>`apps/device/src/crc32.ts` |
| **4. Cloud Cost & Optimization** | Designed to fit Cloudflare Free Tier (1 block/s, hibernating WebSockets, 0.72% daily write budget, lazy DO alarm differential verification). | `docs/FREE_TIER_BUDGET.md`<br>`apps/cloud/` |
| **5. Testing & Verification** | Non-invasive TCP fault-injecting proxy (`tools/chaos/src/proxy.ts`), automated 8-scenario matrix, fast-check property testing, mathematical ground truth checker. | `tools/chaos/`<br>`docs/EVIDENCE.md` |
| **6. Front-End & Presentation** | Spatial Neumorphic Glass design system, 60fps Canvas ECG with glowing peak dots, double-lane ledger tiling, recruiter tour, < 120 KB gzip bundle. | `apps/web/`<br>`docs/DEMO_SCRIPT.md` |

---

## 3. Remaining Systems Risks & Mitigations

1. **Host-Level Flash Controller Deception (SD Cards)**:
   - *Risk*: Cheap consumer SD cards may acknowledge OS write barriers before volatile controller cache drains to flash memory.
   - *Mitigation*: Explicitly documented in `docs/GUARANTEES.md`. For medical-grade field deployment, industrial pSLC microSD, eMMC, or a supercapacitor UPS is required.
2. **Prolonged Hardware Outage Beyond Mock Buffer**:
   - *Risk*: The mock sensor service buffers only 10 seconds of biosignals. If the board is unpowered for $> 10$ s, physical samples generated during that window cannot be retrieved.
   - *Mitigation*: The reader detects the gap immediately upon reconnect via `from_index` and logs an honest `power_cut_unread` loss, preserving the accounting identity without fabricating data.
3. **Cloudflare Free Tier Daily Write Spike on Extreme Outage**:
   - *Risk*: If a device experiences multiple 2-hour outages in a single 24-hour cycle, cumulative catch-up writes could approach the 1,000,000 rows/day limit.
   - *Mitigation*: Handled by `SyncClient` rate-limiting (max 2 req/s) and block batching (100 blocks per transaction), using only 1.44% of daily write quota per 2-hour outage.
