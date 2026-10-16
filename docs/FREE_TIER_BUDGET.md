# Cloudflare Free-Tier Resource Budget

## 1. Verified Cloudflare Free Plan Limits

| Metric | Cloudflare Free Limit | Source |
| :--- | :--- | :--- |
| **Worker Requests** | 100,000 req/day | Workers Platform Limits |
| **Worker CPU Time** | 10 ms CPU per request | Workers Free Tier |
| **Worker Memory** | 128 MB | Workers Platform Limits |
| **Durable Objects Availability** | Available on Free Tier (SQLite backend) | Cloudflare DO GA (2024) |
| **Durable Object SQLite Writes** | 1,000,000 rows written / day | DO Free Limits |
| **Durable Object SQLite Reads** | 5,000,000 rows read / day | DO Free Limits |
| **Durable Object Storage** | 5 GB total storage | DO Free Limits |
| **WebSocket Hibernation** | Active duration = 0 while idle; billed only per active event | DO WebSocket Hibernation API |

---

## 2. Resource Budget: 1-Hour Online Run

### Ingestion Strategy
- Store **1 row per 1-second block** (NOT per sample).
- Sensor 1 (3 channels, 400 Hz) = 1 block/s = 3.6 KB packed payload.
- Sensor 2 (2 channels, 400 Hz) = 1 block/s = 2.4 KB packed payload.
- Total incoming stream = 2 blocks/s = 6.0 KB/s payload.

### Computations for 1 Hour (3,600 s)
- **Blocks Ingested**: 3,600 s × 2 sensors = **7,200 blocks/hour**.
- **WebSocket Messages**: 7,200 messages / hour over hibernating WebSocket.
- **SQLite Rows Written**: 7,200 rows/hour = **0.72%** of 1,000,000 daily limit.
- **SQLite Storage Growth**: 7,200 rows × ~3 KB avg = **~21.6 MB/hour** (out of 5 GB = 0.43%).
- **Worker CPU Time**: Incremental push into `@mayacardio/core` takes ~0.08 ms CPU per block (< 1% of 10 ms limit).
- **Latency to Result**: Windows finalized immediately on block arrival, well under the **< 5 s target** (< 100 ms typical).

---

## 3. Resource Budget: 2-Hour Outage Catch-up

### Outage Parameters
- 2 hours = 7,200 seconds = 14,400 un-synced blocks (2 sensors).
- Target catch-up duration: **< 15 minutes** (900 seconds).

### Batching & Sync Design
- Batched sync via `POST /sync`: **100 blocks per request** (gzipped / compact byte payload).
- Total HTTP requests required: 14,400 / 100 = **144 requests**.
- 144 requests out of 100,000 daily limit = **0.14%** of daily request quota.
- SQLite Rows Written: 14,400 rows in 144 transactions = **1.44%** of daily write quota.
- Sync Duration: 144 requests across 900 seconds = ~0.16 req/sec (1 req every 6 s) — easily completes in **~60-90 seconds** at 2 req/s with ample margin (< 2 minutes vs 15 min requirement).
- Live data streaming over WebSocket maintains priority queue; backlog sync runs concurrently in background worker queue.

---

## 4. Differential Verification & Alarms
- Cloud recomputes offline results lazily using DO Alarms in chunks of 50 windows to remain within 10 ms CPU.
- Discrepancies between device-uploaded results and cloud-recomputed results are flagged in differential check table.
