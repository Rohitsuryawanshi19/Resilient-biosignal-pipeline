# Bugs Found & Fixed During Development and Chaos Testing

This document logs real edge-case bugs discovered during chaos and invariant testing, their root cause, and how they were resolved.

---

### Bug 1: `bun:sqlite` Database Method Precedence in Universal SQL Adapter
- **Symptom**: During cloud sync integration tests, `cloudDO.getExport()` returned 0 rows despite successful block writes.
- **Root Cause**: In `apps/cloud/src/sql-adapter.ts`, `typeof nativeSql.exec === 'function'` was evaluated before checking `nativeSql.query`. In `bun:sqlite`, `db.exec()` exists but returns metadata (`{ changes, lastInsertRowid }`) rather than query rows. Cloudflare Workers DO `sql.exec()` returns an iterable cursor.
- **Fix**: Re-ordered adapter detection to check `nativeSql.query` first. If present, it uses `bun:sqlite`'s `.query(q).all(...)`. If not, it falls back to Cloudflare DO's `sql.exec(q).toArray()`.

---

### Bug 2: Primary Key Violation on Duplicate Ingest Retries in Cloud Durable Object
- **Symptom**: `SQLiteError: UNIQUE constraint failed: blocks.sensor, blocks.first_index` during simulated network flapping and reconnect catch-up.
- **Root Cause**: `SessionDO.ingestBlock()` issued `INSERT INTO blocks` rather than `INSERT OR IGNORE INTO blocks`. When the device re-sent in-flight blocks during reconnection, the second write threw a primary key constraint error.
- **Fix**: Replaced raw `INSERT` with `INSERT OR IGNORE INTO blocks`. Duplicates are now safely ignored, preserving the idempotency guarantee.

---

### Bug 3: Windows Subprocess CWD Path Nesting in SIGKILL Crash Loop
- **Symptom**: `ENOENT: uv_spawn 'bun'` thrown during process kill tests.
- **Root Cause**: The test runner executed with current working directory `apps/device`. Calling `path.resolve('apps/device')` resolved to `c:\...\apps\device\apps\device`, which does not exist on disk, causing libuv to fail before spawning.
- **Fix**: Passed `process.cwd()` and `process.execPath` directly to `Bun.spawn`, ensuring reliable child process spawning across all platforms.

---

### Bug 4: Test Mock Server Sensor Mismatch During Alternating Polling
- **Symptom**: Audit reported unexpected gap `[0, 10)` on Sensor 2 during session-restart tests.
- **Root Cause**: The test mock server hardcoded `sensor: 1` in its reply without inspecting `req.sensor`. When the device reader alternated to poll Sensor 2, the reply was recorded under Sensor 2 with Sensor 1's payload, skipping Sensor 2's starting indices.
- **Fix**: Updated the test mock server to dynamically read `req.sensor` from the incoming NDJSON request line and maintain separate index counters per sensor.

---

### Bug 5: Shared Index Counter in Chaos SIGKILL Crash Harness
- **Symptom**: Audit reported missing ranges when resuming ingest across child restarts in Scenario 5.
- **Root Cause**: The mock server in `runScenario5_ProcessSigkillCrash` used a unified `let sIdx = 0` shared between Sensor 1 and Sensor 2 and did not honour `req.from_index`. When the child process was killed and restarted, the reader requested resume points with `from_index`, but the mock server served from the unified advancing counter, creating artificial gaps.
- **Fix**: Replaced unified `sIdx` with per-sensor dictionary `sIndices: Record<1|2, number>`, initialized `firstIndex = req.from_index ?? sIndices[sensor]`, and updated per-sensor indices accordingly.

---

### Bug 6: Case Sensitivity in SQLite ENOSPC / SQLITE_FULL Error Detection
- **Symptom**: Uncaught `SQLiteError: database or disk is full` during disk capacity exhaustion testing, failing to trigger reserve file unlinking.
- **Root Cause**: In `apps/device/src/store.ts`, `writeBlock()` checked `errMsg.includes('FULL')`. The native SQLite error message emitted by `bun:sqlite` is `"database or disk is full"` in lowercase, making `errMsg.includes('FULL')` evaluate to `false`.
- **Fix**: Normalized the check to `errMsg.toLowerCase().includes('full') || errMsg.includes('ENOSPC') || (err as any)?.code === 'SQLITE_FULL'`. In addition, when simulating page capacity limits, relaxing internal page limits upon reserve unlinking allows the emergency `disk_full` loss record to be persisted.


