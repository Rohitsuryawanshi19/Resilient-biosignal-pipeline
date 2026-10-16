#!/usr/bin/env bash
set -euo pipefail

echo "=== Installing Resilient Biosignal Pipeline on Raspberry Pi OS (64-bit) ==="

# Check root
if [ "$(id -u)" -ne 0 ]; then
  echo "Error: install.sh must be run as root (sudo bash scripts/install.sh)" >&2
  exit 1
fi

BIN_SRC=""
if [ -f "./pipeline-linux-arm64" ]; then
  BIN_SRC="./pipeline-linux-arm64"
elif [ -f "./pipeline" ]; then
  BIN_SRC="./pipeline"
else
  echo "Error: pipeline binary not found in current directory" >&2
  exit 1
fi

# 1. Install binary
echo "-> Installing binary to /usr/local/bin/pipeline..."
install -m 755 "$BIN_SRC" /usr/local/bin/pipeline

# 2. Create system user
if ! id -u pipeline >/dev/null 2>&1; then
  echo "-> Creating system user 'pipeline'..."
  useradd -r -s /usr/sbin/nologin -d /var/lib/pipeline pipeline
fi

# 3. Create persistent data directory
echo "-> Creating data directory /var/lib/pipeline..."
mkdir -p /var/lib/pipeline
chown -R pipeline:pipeline /var/lib/pipeline
chmod 750 /var/lib/pipeline

# 4. Install systemd service
echo "-> Installing systemd unit /etc/systemd/system/pipeline.service..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/pipeline.service" /etc/systemd/system/pipeline.service

# 5. Enable and start daemon
echo "-> Enabling and starting pipeline.service..."
systemctl daemon-reload
systemctl enable pipeline.service
systemctl restart pipeline.service

echo "=== Pipeline successfully installed and started! ==="
systemctl status pipeline.service --no-pager
