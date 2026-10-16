# Evidence of Failure Tests

Automated failure-injection matrix executed by `tools/chaos/src/harness.ts`.

| Scenario | Injected Fault | Expected Behavior | Observed Behavior | Status | Duration |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **CRC Corruption & Recovery** | Single bad CRC injected on reply | Reader detects bad CRC, issues re-read via from_index, recovers data without loss | Clean re-read recovery; 0 gaps, 0 overlaps | **PASS** | 296ms |
| **Unrecoverable CRC Mismatch** | Persistent corrupt CRC across all retries | Binds retries to 3, logs honest loss "crc_mismatch_unrecoverable", advances stream | Recorded crc_mismatch_unrecoverable loss; audit clean | **PASS** | 230ms |
| **Duplicate Replies Dropped** | Proxy duplicates identical block replies | Deduplicated on (session, sensor, first_index); 0 overlaps in audit | Duplicates dropped idempotently; 0 overlaps | **PASS** | 196ms |
| **Network Outage, Auto-Switch & Catch-up** | Sever network to cloud mid-run, buffer to disk, restore network | Switch to offline < 10s, zero samples dropped, catch-up < 15 min, cloud export == device export | Switched in 1101ms (<10s), caught up in 99ms, exports matched exactly | **PASS** | 1365ms |
| **Crash & Hard-Kill (SIGKILL) Resilience** | SIGKILL daemon mid-stream across 5 iterations | WAL auto-recovers; audit passes; zero stored samples corrupted vs ground truth | Recovered cleanly from 5 SIGKILL events; 2460 samples verified against ground truth; 0 gaps, 0 overlaps | **PASS** | 587ms |
| **Disk Full (ENOSPC) & Reserve Recovery** | PRAGMA max_page_count limit triggering SQLITE_FULL / ENOSPC | Reserve file (64MB) deleted on ENOSPC; emergency loss record written with reason="disk_full"; 0 overlaps | Deleted emergency reserve file, recorded loss reason="disk_full", audit invariants verified | **PASS** | 39ms |
| **Wall-Clock Jump (+3h / -5h) Monotonic Isolation** | Jump Date.now() +3 hours forward, then -5 hours backward during ingest | No corrupted windows; monotonic timeouts unharmed; 0 gaps, 0 overlaps | Audited clean with 6540 samples; clock jumps caused 0 gaps or overlaps | **PASS** | 486ms |
| **Abrupt Power-Cut Durability & Loss Bound** | Hard power-cut simulation with synchronous=FULL fsync-WAL recovery check | Loss ≤ 1 in-flight reply (≤ 1s / 400 samples); WAL auto-recovers; audit passes | synchronous=FULL (2) verified; WAL clean recovery; all 500 durable samples intact with 0 gaps/overlaps | **PASS** | 81ms |

## Invariants Verified Across All Scenarios
- **Accounting Identity**: `stored ∩ lost = ∅` (0 overlaps) and `stored ∪ lost` has no holes.
- **Zero Corruption**: Every stored sample matches ground truth ramp formula `(3i+c) mod 8388608` / `(2i+c) mod 8388608`.
- **Mode Switch**: Transitions to offline within < 10 s hard bound.
- **Cloud Consistency**: Device export matches Cloud export exactly.
- **Power-Cut Loss Bounded**: At most 1 in-flight reply per sensor (≤ 1 s) plus mock buffer lost while down.
