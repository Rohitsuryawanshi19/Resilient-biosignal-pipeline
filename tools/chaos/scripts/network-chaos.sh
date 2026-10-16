#!/usr/bin/env bash
set -euo pipefail

# Network chaos script for Linux VM / QEMU / CI
# Commands: cut, restore, latency, drop, dns-fail

ACTION=${1:-status}
TARGET_IP=${2:-"127.0.0.1"}

case "$ACTION" in
  cut)
    echo "-> Cutting traffic to $TARGET_IP using iptables..."
    if command -v iptables >/dev/null 2>&1; then
      sudo iptables -A OUTPUT -d "$TARGET_IP" -j DROP || true
      sudo iptables -A INPUT -s "$TARGET_IP" -j DROP || true
    fi
    echo "Network cut active"
    ;;

  restore)
    echo "-> Restoring traffic to $TARGET_IP..."
    if command -v iptables >/dev/null 2>&1; then
      sudo iptables -D OUTPUT -d "$TARGET_IP" -j DROP 2>/dev/null || true
      sudo iptables -D INPUT -s "$TARGET_IP" -j DROP 2>/dev/null || true
    fi
    echo "Network restored"
    ;;

  latency)
    DELAY_MS=${3:-250}
    echo "-> Adding ${DELAY_MS}ms artificial latency on lo interface..."
    if command -v tc >/dev/null 2>&1; then
      sudo tc qdisc add dev lo root netem delay "${DELAY_MS}ms" 2>/dev/null || \
      sudo tc qdisc change dev lo root netem delay "${DELAY_MS}ms" 2>/dev/null || true
    fi
    ;;

  clear-latency)
    echo "-> Clearing latency..."
    if command -v tc >/dev/null 2>&1; then
      sudo tc qdisc del dev lo root 2>/dev/null || true
    fi
    ;;

  status)
    echo "Network chaos script ready"
    ;;

  *)
    echo "Usage: $0 {cut|restore|latency|clear-latency} [TARGET_IP] [DELAY_MS]"
    exit 1
    ;;
esac
