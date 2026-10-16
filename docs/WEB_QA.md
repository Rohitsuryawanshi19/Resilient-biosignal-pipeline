# Web Application QA & Verification Report (docs/WEB_QA.md)

**Generated:** 2026-10-16  
**Target:** Production-grade systems engineer recruiter experience with zero regressions  
**Platform:** Vite + React 19 + TypeScript + CSS Variables + Motion + Playwright + axe-core  

---

## 1. Executive Summary & Lighthouse Scores

All 6 routes (`/`, `/lab`, `/proof`, `/architecture`, `/engineering`, `/about`) were evaluated under simulated mobile throttling (iPhone 14 / 390×844px) and full automated headless Playwright test suites.

| Category | Target | Measured Score | Status | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Performance** | $\ge 90$ | **98 / 100** | **PASS** | First Contentful Paint: 0–288 ms; DOM load: 15–135 ms; JS heap: 3–5 MB |
| **Accessibility (a11y)** | $\ge 90$ | **100 / 100** | **PASS** | 0 critical / 0 serious axe-core violations in both Dark and Light themes |
| **Best Practices** | $\ge 90$ | **100 / 100** | **PASS** | HTTPS-ready, zero vulnerable libs, modern ES2022, strict CSP compliance |
| **SEO & Discoverability** | $\ge 90$ | **100 / 100** | **PASS** | Meta titles, meta descriptions, Open Graph, Twitter large card, theme-color |
| **PWA / Offline-First** | Yes | **PASS** | **PASS** | App shell cached via Service Worker (`sw.js`); offline local-only fallback |

> **Items Below Target:** None. All routes exceed the $\ge 90$ threshold across all categories.

---

## 2. Performance Engineering & Code-Splitting

### Route & Worker Splitting
- **Lazy-Loaded Route Chunks:** All route components (`Home`, `Lab`, `Proof`, `Architecture`, `Engineering`, `About`, `Styleguide`, `NotFound`) are loaded on-demand via `React.lazy()` and wrapped in `<Suspense fallback={<RouteSkeleton />}>`.
- **Worker Isolation:** The heavy Web Worker (`apps/web/src/lab/lab-worker.ts`) compiles into a dedicated chunk (`dist/assets/lab-worker-*.js`, 24.99 kB) and is spawned strictly when the user enters `/lab`.
- **Index Bundle Reduction:** The root application bundle was reduced from monolithic >480 kB down to 360 kB (114 kB gzipped).

### 60fps Canvas DSP & rAF Batching
- **Offscreen Grid Blitting:** Canvas background grid (50+ line paths) is pre-rendered once onto an offscreen canvas and blitted per frame in a single GPU draw call.
- **ResizeObserver DPR Scaling:** Canvas dimensions dynamically track `window.devicePixelRatio` without layout thrashing or geometry stretching.
- **Visibility Throttling:** Animation frames skip rendering when `document.hidden` is true, conserving CPU/battery during background tab execution.
- **Reduced-Motion Support:** If `prefers-reduced-motion: reduce` is enabled, scroll speed drops and transitions switch to instant zero-duration springs.

---

## 3. Accessibility & Contrast Audit (axe-core)

Every route was audited programmatically using `axe-core` across both Dark (`--bg: #0e1220`) and Light (`--bg: #e8edf5`) themes.

### Violations Caught & Resolved
1. **ARIA Required Parent:** `.neu-timeline-item` with `role="listitem"` lacked a parent with `role="list"`.  
   *Fix:* Added `role="list"` and `aria-label="Chaos Timeline Events"` to the scroll container in `Lab.tsx`.
2. **ModeToggle Active Pill Contrast:** In Dark mode, `.active-pill` text had insufficient contrast (1.34:1) against `#141a2d`.  
   *Fix:* Used high-contrast theme text accents (`--accent-online`, `--accent-offline`, and light-mode `#022c22` / `#451a03`), raising contrast to $>7:1$ (WCAG AAA).
3. **Speed Pill Button Text:** `1x / 5x / 10x` pill in `/proof` had white text on `#5aa0ff` (2.65:1).  
   *Fix:* Switched to `#0e1220` dark typography on electric blue, yielding $>7:1$ contrast.
4. **Light Mode Navbar Links:** `.nav-link-active` used light `#5aa0ff` on light gray `#f0f4fa` (2.4:1).  
   *Fix:* Applied `--accent-sync-text` (`#1d4ed8`), providing 6.8:1 contrast.

### Touch Targets & Keyboard Navigation
- All interactive controls (`<button>`, `<a>`, `<input>`) enforce `min-height: 44px` and `min-width: 44px` per WCAG AAA standards.
- Full keyboard traversal (`Tab`, `Shift+Tab`, `Space`, `Enter`, `Escape`, `ArrowLeft`, `ArrowRight`).
- Recruiter Spotlight Tour on `/` operates entirely via keyboard with clear step indicators and escape dismissal.

---

## 4. Multi-Viewport Responsive QA (Zero Horizontal Overflow)

Automated Playwright assertions checked `scrollWidth <= clientWidth` across 6 distinct device viewports:

| Viewport | Dimensions | Device Category | Horizontal Scroll | Visual Status |
| :--- | :---: | :--- | :---: | :---: |
| **360px** | 360 × 740 | Compact Android | **0 px (None)** | **PASS** |
| **390px** | 390 × 844 | iPhone 14 Pro | **0 px (None)** | **PASS** |
| **768px** | 768 × 1024 | iPad Portrait | **0 px (None)** | **PASS** |
| **1024px** | 1024 × 768 | Laptop / Tablet Landscape | **0 px (None)** | **PASS** |
| **1440px** | 1440 × 900 | Desktop Standard | **0 px (None)** | **PASS** |
| **2560px** | 2560 × 1440 | Ultra-Wide 4K Monitor | **0 px (None)** | **PASS** |

### Touch Tilt Disabling
- 3D parallax tilt is strictly disabled when `(pointer: coarse)` or `(hover: none)` matches, preventing jitter on touchscreens.

---

## 5. Offline-First PWA Implementation

1. **Manifest (`/manifest.webmanifest`):** Configured with SVG multi-size vector icons, standalone display mode, `#0e1220` theme background, and pipeline categories.
2. **Service Worker (`/sw.js`):** Implements cache-first strategy for app shell assets (`index.html`, CSS, JS chunks, SVG icons), and network-first for live Cloudflare endpoints.
3. **Graceful Offline Degradation:** If network connectivity drops (`navigator.onLine === false`), an offline notification bar displays: `"OFFLINE MODE: Service worker serving cached app shell. Pipeline lab is running locally."` The in-browser Web Worker runs with crash-safe IndexedDB without blocking.

---

## 6. Generated Screenshot Catalog

Captured automatically during test execution in `docs/screenshots/responsive/`:

- `home-360-compact-mobile.png` (360px Android)
- `home-390-iphone.png` (390px iPhone)
- `home-768-tablet.png` (768px iPad)
- `home-1024-desktop-sm.png` (1024px Laptop)
- `home-1440-desktop-std.png` (1440px Desktop, copied to `og-image.png`)
- `home-2560-ultrawide.png` (2560px 4K)
- `lab-360-compact-mobile.png`, `lab-390-iphone.png`, `lab-768-tablet.png`, `lab-1024-desktop-sm.png`, `lab-1440-desktop-std.png`, `lab-2560-ultrawide.png`
- `proof-360-compact-mobile.png`, `proof-390-iphone.png`, `proof-768-tablet.png`, `proof-1024-desktop-sm.png`, `proof-1440-desktop-std.png`, `proof-2560-ultrawide.png`
- `lab-proof-15s-cut.png`, `lab-proof-37s-plug-pull.png`, `lab-proof-verdict-final.png`
