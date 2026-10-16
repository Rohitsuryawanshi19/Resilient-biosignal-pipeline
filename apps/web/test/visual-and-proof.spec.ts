import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Visual Responsive Check & 60-Second Proof', () => {
  const screenshotsDir = path.resolve('..', '..', 'docs', 'screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test('1. Visual checks at 390px (mobile), 768px (tablet), and 1440px (desktop)', async ({ page }) => {
    test.setTimeout(45000);

    page.on('console', (msg) => console.log('[BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('[BROWSER ERROR]', err.message));

    // Desktop: 1440px
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/lab', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, 'lab-desktop-1440.png'), fullPage: true });

    // Tablet: 768px
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, 'lab-tablet-768.png'), fullPage: true });

    // Mobile: 390px
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await expect(page.locator('.mobile-mini-status')).toBeVisible();
    await expect(page.locator('.lab-section-tabs')).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, 'lab-mobile-390.png'), fullPage: true });

    console.log('[Visual Test] Saved screenshots for 1440px, 768px, 390px');
  });

  test('2. Execute real 60-second proof, monitor 60fps performance, and capture verdict', async ({ page }) => {
    test.setTimeout(90000);

    page.on('console', (msg) => console.log('[BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('[BROWSER ERROR]', err.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/lab', { waitUntil: 'networkidle' });

    // Confirm initial state
    const startProofBtn = page.locator('[data-testid="start-proof-btn"]');
    await expect(startProofBtn).toBeVisible();

    // Start 60-second real proof
    console.log('[Proof Test] Clicking "Run 60-Second Real Proof"...');
    await startProofBtn.click();

    // Measure FPS / animation frame smoothness during run
    const fps = await page.evaluate(async () => {
      let frameCount = 0;
      const start = performance.now();
      return new Promise<number>((resolve) => {
        function count() {
          frameCount++;
          if (performance.now() - start < 1000) {
            requestAnimationFrame(count);
          } else {
            resolve(frameCount);
          }
        }
        requestAnimationFrame(count);
      });
    });
    console.log(`[Proof Test] Measured canvas & UI frame rate: ${fps} FPS`);
    expect(fps).toBeGreaterThanOrEqual(30); // Smooth profile in headless test environment

    // Wait through the scripted faults (sample checks at 15s, 30s, 45s)
    await page.waitForTimeout(15000); // Past network cut (10s)
    await page.screenshot({ path: path.join(screenshotsDir, 'lab-proof-15s-cut.png') });

    await page.waitForTimeout(22000); // Past mock stall (20s), CRC (25s), plug pull (35s)
    await page.screenshot({ path: path.join(screenshotsDir, 'lab-proof-37s-plug-pull.png') });

    // Wait until 60-second proof completes
    await page.waitForTimeout(25000); // Total ~62 seconds

    // Assert Verdict Card appears with criteria
    const criteriaTable = page.locator('.criteria-table');
    await expect(criteriaTable).toBeVisible({ timeout: 15000 });

    // Assert all 6 criteria passed
    const passChips = page.locator('.criteria-table .neu-chip-online');
    await expect(passChips).toHaveCount(6);

    // Verify accounting identity held
    const identityBar = page.locator('.accounting-identity-bar');
    await expect(identityBar).toHaveClass(/identity-pass/);

    // Capture screenshot of final verdict
    await page.screenshot({ path: path.join(screenshotsDir, 'lab-proof-verdict-final.png'), fullPage: true });

    // Test "Verify Yourself" button
    const verifyBtn = page.locator('[data-testid="verify-yourself-btn"]');
    await verifyBtn.click();

    const verificationPanel = page.locator('[data-testid="verification-panel"]');
    await expect(verificationPanel).toBeVisible({ timeout: 10000 });
    await expect(verificationPanel).toHaveClass(/pass/);

    console.log('[Proof Test] 60-second real proof successfully executed with 6/6 criteria passed & verified!');
  });
});
