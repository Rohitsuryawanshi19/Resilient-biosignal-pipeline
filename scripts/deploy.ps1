# MayaCardio Pipeline Cloudflare Free-Plan Deployment (PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  MayaCardio Pipeline Cloudflare Free-Plan Deployment" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir

Set-Location $RepoRoot

# 1. Audit wrangler.toml for paid bindings
Write-Host "[1/4] Auditing apps/cloud/wrangler.toml for paid bindings..." -ForegroundColor Yellow
$WranglerFile = Join-Path $RepoRoot "apps/cloud/wrangler.toml"

if (-not (Test-Path $WranglerFile)) {
    Write-Error "[-] ERROR: $WranglerFile not found."
}

$WranglerContent = Get-Content $WranglerFile -Raw
$PaidPatterns = @("vectorize", "hyperdrive", "analytics_engine", "queues", "usage_model.*bundled", "smart_placement")

foreach ($pattern in $PaidPatterns) {
    if ($WranglerContent -match $pattern) {
        Write-Error "[-] FATAL ERROR: Paid binding or flag detected matching '$pattern' in $WranglerFile! MayaCardio runs strictly on Free Plan ($0.00)."
    }
}
Write-Host "[+] Free-plan verification PASSED (0 paid bindings detected)." -ForegroundColor Green

# 2. Build Web Assets
Write-Host "[2/4] Building apps/web production assets..." -ForegroundColor Yellow
Set-Location (Join-Path $RepoRoot "apps/web")
bun run build

$IndexHtml = Join-Path $RepoRoot "apps/web/dist/index.html"
if (-not (Test-Path $IndexHtml)) {
    Write-Error "[-] ERROR: Build failed. $IndexHtml missing."
}
Write-Host "[+] Web assets built successfully in apps/web/dist." -ForegroundColor Green

# 3. Check Wrangler Login
Write-Host "[3/4] Checking Cloudflare account authentication..." -ForegroundColor Yellow
Set-Location (Join-Path $RepoRoot "apps/cloud")
$whoami = npx wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[-] You are not currently logged in to Cloudflare." -ForegroundColor Red
    Write-Host "1. Sign up for free at https://dash.cloudflare.com/sign-up"
    Write-Host "2. Run: npx wrangler login"
    Write-Host "3. Re-run: .\scripts\deploy.ps1"
    Exit 1
}

# 4. Deploy
Write-Host "[4/4] Deploying Cloudflare Worker with Static Assets..." -ForegroundColor Yellow
npx wrangler deploy

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  [+] DEPLOYMENT SUCCESSFUL! ($0.00 Free Plan)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
