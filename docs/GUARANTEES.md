# Durability Guarantees

## Max Loss on Power Cut

With `PRAGMA synchronous=FULL` and WAL mode, SQLite fsyncs the WAL on every
commit. The protocol is: verify → write+fsync → advance pointer → next read.

**Maximum data loss on abrupt power cut:**
> At most one in-flight reply per sensor (~400 samples = 1 second at 400 Hz).
> On restart, the reader resumes from the last durable `first_index + count`,
> re-requesting any in-flight range with `from_index`.
> If the mock has already advanced past that window (mock keeps only 10s),
> the missed samples are recorded as a loss with `reason: "power_cut_unread"`.

**Total worst-case loss = (one in-flight reply per sensor) + (mock window missed
during downtime) ≤ 1s device + (downtime × 400 samples/s mock buffer lost)**.

## Hardware Caveat

SD card controllers on Raspberry Pi may acknowledge fsync without physically
writing to NAND. `synchronous=FULL` is necessary but not sufficient on such
hardware. A UPS or capacitor-backed storage eliminates this risk.

## Reserve File

A 64 MB reserve file is pre-allocated at startup. On ENOSPC, it is deleted
to recover space for writing loss records. This ensures losses are always
recorded even when the disk is full.
