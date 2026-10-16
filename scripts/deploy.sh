#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "  MayaCardio Pipeline Cloudflare Free-Plan Deployment"
echo "=========================================================="

# 1. Root & Directory sanity checks
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "[1/5] Checking environment & tools..."
if ! command -v bun &> /dev/null && ! command -v npm &> /dev/null; then
  echo "[-] ERROR: Neither 'bun' nor 'npm' was found on PATH." >&2
  exit 1
fi

# 2. Free-Tier Paid Binding Audit
echo "[2/5] Auditing apps/cloud/wrangler.toml for paid bindings..."
WRANGLER_FILE="${REPO_ROOT}/apps/cloud/wrangler.toml"

if [ ! -f "${WRANGLER_FILE}" ]; then
  echo "[-] ERROR: ${WRANGLER_FILE} not found." >&2
  exit 1
fi

PAID_PATTERNS=("vectorize" "hyperdrive" "analytics_engine" "queues" "usage_model.*bundled" "smart_placement")
for pattern in "${PAID_PATTERNS[@]}"; do
  if grep -Eiq "${pattern}" "${WRANGLER_FILE}"; then
    echo "[-] FATAL ERROR: Paid binding or flag detected matching '${pattern}' in ${WRANGLER_FILE}!" >&2
    echo "    MayaCardio must run 100% within the Cloudflare Workers Free Plan (\$0.00, no card)." >&2
    exit 1
  fi
done
echo "[+] Free-plan verification PASSED (0 paid bindings detected)."

# 3. Build Web Application Static Assets
echo "[3/5] Building apps/web production assets..."
cd "${REPO_ROOT}/apps/web"
if command -v bun &> /dev/null; then
  bun run build
else
  npm run build
fi

if [ ! -f "${REPO_ROOT}/apps/web/dist/index.html" ]; then
  echo "[-] ERROR: Build failed. apps/web/dist/index.html is missing." >&2
  exit 1
fi
echo "[+] Web assets built successfully in apps/web/dist."

# 4. Wrangler Authentication Check
echo "[4/5] Checking Cloudflare account authentication..."
cd "${REPO_ROOT}/apps/cloud"

if ! npx wrangler whoami &> /dev/null; then
  echo "[-] You are not currently logged in to Cloudflare."
  echo ""
  echo "To deploy for free without a credit card:"
  echo "  1. Sign up for a free account at https://dash.cloudflare.com/sign-up"
  echo "  2. Run: npx wrangler login"
  echo "  3. Re-run: ./scripts/deploy.sh"
  echo ""
  exit 1
fi

# 5. Deploy Cloud Worker + Static Assets + Session DO
echo "[5/5] Deploying Cloudflare Worker with Static Assets & Durable Objects..."
npx wrangler deploy

echo ""
echo "=========================================================="
echo "  [+] DEPLOYMENT SUCCESSFUL!"
echo "  - Static assets served via Cloudflare Workers Assets"
echo "  - State & streaming managed via SessionDO (SQLite on edge)"
echo "  - Cost: \$0.00 / Free Plan Forever (No billing required)"
echo "=========================================================="
