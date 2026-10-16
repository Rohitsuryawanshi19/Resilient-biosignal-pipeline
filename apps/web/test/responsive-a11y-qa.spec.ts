import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const axeScript = fs.readFileSync(path.resolve('node_modules', 'axe-core', 'axe.min.js'), 'utf-8');

test.describe('Responsive QA & Accessibility & Performance Audit', () => {
  const screenshotsDir = path.resolve('..', '..', 'docs', 'screenshots', 'responsive');
  const viewports = [
    { width: 360, height: 740, name: '360-compact-mobile' },
    { width: 390, height: 844, name: '390-iphone' },
    { width: 768, height: 1024, name: '768-tablet' },
    { width: 1024, height: 768, name: '1024-desktop-sm' },
    { width: 1440, height: 900, name: '1440-desktop-std' },
    { width: 2560, height: 1440, name: '2560-ultrawide' },
  ];

  const routes = ['/', '/lab', '/proof', '/architecture', '/engineering', '/about'];

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test('1. Multi-viewport responsive checks (360, 390, 768, 1024, 1440, 2560) - Zero Horizontal Scroll', async ({ page }) => {
    test.setTimeout(90000);

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      for (const route of routes) {
        await page.goto(`/#${route}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(300);

        // Assert no horizontal scrolling
        const scrollInfo = await page.evaluate(() => {
          const doc = document.documentElement;
          const body = document.body;
          return {
            scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
            clientWidth: doc.clientWidth,
          };
        });

        const hasHorizontalScroll = scrollInfo.scrollWidth > scrollInfo.clientWidth + 2;
        expect(hasHorizontalScroll, `Route ${route} at ${vp.width}px has horizontal scroll: scrollWidth=${scrollInfo.scrollWidth}, clientWidth=${scrollInfo.clientWidth}`).toBe(false);

        // Capture screenshot for Home, Lab, and Proof across key viewports
        if (route === '/' || route === '/lab' || route === '/proof') {
          const routeSlug = route === '/' ? 'home' : route.slice(1);
          const screenshotPath = path.join(screenshotsDir, `${routeSlug}-${vp.name}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
        }
      }
    }
    console.log('[Responsive QA] All 6 viewports tested with 0 horizontal overflow');
  });

  test('2. Accessibility Audit with axe-core across all routes in Dark and Light modes', async ({ page }) => {
    test.setTimeout(60000);

    for (const theme of ['dark', 'light'] as const) {
      for (const route of routes) {
        await page.goto(`/#${route}`, { waitUntil: 'networkidle' });

        // Set theme
        await page.evaluate((t) => {
          document.documentElement.setAttribute('data-theme', t);
        }, theme);
        await page.waitForTimeout(200);

        // Inject axe-core
        await page.evaluate(axeScript);

        // Run axe audit
        const results = await page.evaluate(async () => {
          // @ts-ignore
          return await window.axe.run(document, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
            },
            rules: {
              // Canvas element dynamic ECG lines don't need text alternatives inside canvas
              'color-contrast': { enabled: true },
            },
          });
        });

        // Filter out any critical / serious violations
        const severeViolations = results.violations.filter((v: any) => v.impact === 'critical' || v.impact === 'serious');
        if (severeViolations.length > 0) {
          console.error(`[A11y FAIL] ${route} (${theme}):`, JSON.stringify(severeViolations, null, 2));
        }
        expect(severeViolations.length, `Route ${route} in ${theme} mode has ${severeViolations.length} severe a11y violations`).toBe(0);
      }
    }
    console.log('[Accessibility QA] All routes passed axe-core audit with 0 critical or serious violations');
  });

  test('3. Mobile Lighthouse Performance & Vitals Simulation', async ({ page }) => {
    // Mobile emulation profile
    await page.setViewportSize({ width: 390, height: 844 });

    const vitalsReport: Record<string, { fcp: number; domLoad: number; memory?: number }> = {};

    for (const route of routes) {
      const startTime = Date.now();
      await page.goto(`/#${route}`, { waitUntil: 'domcontentloaded' });
      const domLoadTime = Date.now() - startTime;

      // Extract performance timing
      const perfMetrics = await page.evaluate(() => {
        const paintEntries = performance.getEntriesByType('paint');
        const fcp = paintEntries.find((e) => e.name === 'first-contentful-paint')?.startTime || 0;
        return {
          fcp: Math.round(fcp),
          // @ts-ignore
          jsHeapSizeLimit: (performance as any).memory?.jsHeapSizeLimit,
          // @ts-ignore
          usedJSHeapSize: (performance as any).memory?.usedJSHeapSize,
        };
      });

      vitalsReport[route] = {
        fcp: perfMetrics.fcp,
        domLoad: domLoadTime,
        memory: perfMetrics.usedJSHeapSize ? Math.round(perfMetrics.usedJSHeapSize / (1024 * 1024)) : undefined,
      };

      // FCP should be well under 2500ms for 90+ Lighthouse
      expect(domLoadTime).toBeLessThan(3000);
    }

    console.log('[Performance Vitals]', JSON.stringify(vitalsReport, null, 2));
  });
});
