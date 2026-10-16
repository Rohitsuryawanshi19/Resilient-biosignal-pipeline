#!/usr/bin/env bash
set -euo pipefail

# Power-cut testing harness
# Real Raspberry Pi 4 Procedure & QEMU Hard-Kill Emulation

MODE=${1:-manual-docs}

case "$MODE" in
  manual-docs)
    cat <<'EOF'
========================================================================
       MANUAL POWER-CUT TEST PROCEDURE (REAL RASPBERRY PI 4)
========================================================================

Hardware Configuration:
- Raspberry Pi 4 Model B (4GB / 2GB)
- MicroSD Card (SanDisk Extreme / Samsung EVO) or USB3 SSD
- Power: Official 5.1V 3A USB-C Power Supply

Step-by-Step Execution:
1. Boot the Pi and ensure pipeline is running under systemd:
   $ systemctl status pipeline.service
   $ pipeline status

2. Verify continuous active ingestion against sensor mock:
   $ pipeline status # confirm samples_saved incrementing at 800 samples/sec

3. Pull the physical USB-C power plug abruptly (DO NOT run 'shutdown' or 'reboot').
   Pull directly from the board to guarantee instantaneous power drop.

4. Wait 10 seconds. Re-insert the USB-C power cable.

5. Board boots from clean power:
   - Systemd unit 'pipeline.service' automatically restarts after network-online.
   - SQLite WAL recovers automatically via PRAGMA integrity_check.
   - Reader detects last durable index from DB and re-reads from mock.

6. Verification:
   $ pipeline audit
   Confirm: 0 gaps, 0 overlaps, totalStored + totalLost covers range.
   Maximum power-cut loss: at most one in-flight reply (≤ 400 samples = 1s per sensor).
========================================================================
EOF
    ;;

  qemu-simulate)
    echo "=== Running QEMU Power-Cut Emulation ==="
    QEMU_PID=${2:-""}
    if [ -z "$QEMU_PID" ]; then
      echo "Error: Pass QEMU process PID to simulate abrupt power loss: $0 qemu-simulate <PID>" >&2
      exit 1
    fi

    echo "-> Simulating abrupt power loss by SIGKILL on QEMU PID $QEMU_PID..."
    kill -9 "$QEMU_PID"
    echo "QEMU hard-kill complete. Boot image with 'cache=directsync' and run 'pipeline audit'."
    ;;

  *)
    echo "Usage: $0 {manual-docs|qemu-simulate [PID]}"
    exit 1
    ;;
esac
