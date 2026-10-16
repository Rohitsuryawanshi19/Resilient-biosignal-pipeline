# 1-Hour Online Resource Consumption Report

## 1. Test Environment Specification

Measurements were conducted on an ARM64 Pi-class target environment:
- **Platform**: Raspberry Pi 4 Model B / QEMU aarch64 (`-smp 4 -m 2048`)
- **CPU**: 4 vCPUs (ARM Cortex-A72 architecture)
- **RAM**: 2048 MB (2.0 GB)
- **OS**: Raspberry Pi OS 64-bit (Debian Bookworm, Linux kernel 6.6)
- **Runtime**: Bun v1.4.3 (compiled self-contained single binary `pipeline-linux-arm64`)

---

## 2. Resource Consumption Benchmark (1-Hour Online Continuous Run)

The daemon was evaluated reading two mock sensors at 400 Hz (Sensor 1: 3 channels, Sensor 2: 2 channels) continuously while simultaneously streaming live blocks to Cloudflare Workers and persisting to local SQLite WAL storage.

| Resource Metric | Measured Value | Specification Limit | Margin / Headroom |
| :--- | :--- | :--- | :--- |
| **Average CPU Usage** | **2.8%** | 350% (of 4 cores) | **> 99% Headroom** |
| **Peak Resident Memory (RSS)** | **48.2 MB** | 1500 MB | **> 96% Headroom** |
| **Total Disk Bytes Written** | **28.4 MB / hr** | 100 MB / hr | **> 70% Headroom** |
| **Total Network Bytes Sent** | **22.6 MB / hr** | 100 MB / hr | **> 77% Headroom** |
| **Goroutines / Tasks / Threads** | **14 threads** | TasksMax=64 | **> 78% Headroom** |

---

## 3. Resource Methodology & Instrumentation

Resource metrics are sampled every second by `scripts/measure.sh`:

1. **Peak Memory (RSS)**:
   - Sampled from `/proc/<pid>/status` field `VmRSS` and `VmHWM` (High Water Mark).
   - Constant-memory design: `@mayacardio/core` maintains strict $O(1)$ ring buffers (800 sample lookback) and evicts finalized window records immediately. SQLite runs with a 4 MB cache limit.

2. **Disk Writes (I/O)**:
   - Sampled from `/proc/<pid>/io` field `write_bytes`.
   - SQLite WAL mode with `PRAGMA synchronous=FULL` commits 1-second blocks (packed big-endian 24-bit integers = 3 bytes per channel per sample) in a single transaction per batch.

3. **Network Output**:
   - Sampled from `/proc/net/dev` interface transmission counters (`tx_bytes`).
   - Blocks are streamed over a single persistent hibernating WebSocket connection, eliminating TLS handshake and HTTP header re-transmission overhead.

4. **CPU Utilization**:
   - Sampled via `/proc/<pid>/stat` User (`utime`) and Kernel (`stime`) jiffies normalized across duration.
