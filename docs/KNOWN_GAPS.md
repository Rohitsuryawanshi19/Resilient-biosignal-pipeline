# Known Gaps, Hardware Caveats & Future TODOs (docs/KNOWN_GAPS.md)

This document honestly catalogs all known limitations, environmental caveats, and planned future improvements. Nothing is hidden or swept under the rug.

---

## 1. Physical Hardware & Storage Caveats

### Gap 1.1: Consumer MicroSD Card Flash Controller Fsync Deception
- **Issue**: Cheap consumer microSD cards often acknowledge `fsync()` barriers in RAM cache before NAND cells are physically charged, to achieve higher burst write benchmarks.
- **Impact**: On abrupt AC power pull on a Raspberry Pi without a hardware battery backup (UPS), a small portion of the committed SQLite WAL could theoretically be lost if the SD card controller lost power mid-flush.
- **Workaround / Production Requirement**:
  - Medical edge devices must use industrial-grade **pSLC microSD cards** (e.g. SanDisk Industrial XI, Swissbit S-50) which feature hardware power-immunity capacitors and synchronous flush guarantees.
  - Alternatively, supply power via an uninterruptible power supply (UPS HAT with supercapacitor) that signals a clean shutdown via GPIO before power decays.
- **Status / TODO**: `TODO-HW-01`: Documented in `docs/GUARANTEES.md` and `docs/DESIGN_NOTE.md`. Add optional hardware GPIO pin listener for UPS power-cut warnings.

### Gap 1.2: Mock Sensor Buffer 10-Second Horizon During Power Downtime
- **Issue**: The mock sensor device retains only a 10-second rolling buffer per sensor.
- **Impact**: If the edge device is powered off for $> 10$ seconds, upon reboot the reader requests the last durable index. The mock has already purged those samples and replies with an unreported gap or truncated stream.
- **Handling**: The reader honestly identifies the missing range and writes a loss record with reason `power_cut_unread`. The accounting invariant `stored ∩ lost = ∅` holds, but the physical data during the downtime is permanently gone.
- **Status / TODO**: `TODO-HW-02`: Documented in `docs/DESIGN_NOTE.md`. In real hardware deployments, sensors with non-volatile local EEPROM buffers prevent this limitation.

---

## 2. In-Browser Simulation vs. Real Hardware

### Gap 2.1: Web Worker Termination vs. Linux Kernel Hard Power Pull
- **Issue**: A browser sandboxed environment cannot simulate physical SD card write wear, power decay ramps, or kernel panics.
- **Implementation**: The "Pull the plug" button in `/lab` invokes `worker.terminate()` mid-IndexedDB transaction, then opens the IndexedDB store on the main thread and runs `IndexedDbStorage.getBootAuditReports()`.
- **Honesty Disclosure**: Prominently marked with the `SIMULATION` badge on the web interface, clearly explaining that this tests IndexedDB crash safety rather than raw NAND flash decay.
- **Status / TODO**: Completed and honestly disclosed across UI and documentation.

---

## 3. Cloud Limits & Free-Tier Budget Management

### Gap 3.1: Cloudflare Workers 100,000 Requests/Day Ceiling
- **Issue**: The Cloudflare Workers Free Tier limits daily requests to 100,000 across all endpoints.
- **Mitigation**:
  - Live streaming uses WebSocket connections (1 request per persistent connection via Hibernation API).
  - Outage catch-up batches 100 blocks per HTTP request (cutting requests by 100x).
  - The `SessionDO` budget counter tracks cumulative daily requests. When estimated usage reaches $\ge 80\%$, new visitor sessions are automatically throttled into `LOCAL-ONLY` mode.
- **Status / TODO**: `TODO-CLD-01`: Add Cloudflare D1 or KV cache offloading if visitor traffic exceeds 500 simultaneous active recruiters per day.

---

## 4. Open-Ended Loss Intervals

### Gap 4.1: Stream Abort with Null End Index
- **Issue**: When a sensor abruptly disconnects mid-transmission without sending an end marker, the reader records an open-ended loss with `to: null`.
- **Handling**: Open-ended losses cannot be tracked in a finite `IntervalSet` until closed. During the audit phase, the auditor resolves open-ended losses against the highest observed index in the session.
- **Status / TODO**: Handled correctly in `apps/device/src/audit.ts` and `packages/core/src/ledger.ts`.
