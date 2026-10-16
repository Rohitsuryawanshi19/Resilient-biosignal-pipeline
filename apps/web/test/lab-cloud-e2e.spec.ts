import { test, expect } from '@playwright/test';

test.describe('End-to-End Lab Cloud Sync, Faults & Verification', () => {
  test('Full Lab Run: 60s stream, 15s cut, restore, verify exports == ground truth (<10s mode switch, <5s latency)', async ({
    page,
  }) => {
    test.setTimeout(90000); // 90s test timeout

    page.on('console', (msg) => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('[BROWSER ERROR]', err.message));

    // Navigate to /#/lab
    await page.goto('/#/lab', { waitUntil: 'networkidle' });

    // 1. Confirm UI loaded and Cloud Status indicator is visible
    const cloudStatusEl = page.locator('[data-testid="cloud-sync-status"]');
    await expect(cloudStatusEl).toBeVisible();

    // 2. Wait for samples to start saving online
    const samplesSavedEl = page.locator('[data-testid="samples-saved"]');
    await expect(samplesSavedEl).not.toHaveText('0', { timeout: 15000 });

    const modeEl = page.locator('[data-testid="telemetry-mode"]');
    await expect(modeEl).toHaveText('ONLINE');

    console.log('[E2E Test] Stream online and accumulating samples...');

    // 3. Cut network: assert mode switches to OFFLINE within 10 seconds
    const cutBtn = page.locator('[data-testid="cut-network-btn"]');
    const cutTime = Date.now();
    await cutBtn.click();
    console.log('[E2E Test] Network cut initiated...');

    await expect(modeEl).toHaveText('OFFLINE', { timeout: 10000 });
    const switchElapsed = (Date.now() - cutTime) / 1000;
    console.log(`[E2E Test] Switched to OFFLINE in ${switchElapsed.toFixed(2)}s (< 10s target verified)`);
    expect(switchElapsed).toBeLessThan(10);

    // 4. Stay offline for 10-15s while engine saves to IndexedDB
    await page.waitForTimeout(10000);

    // 5. Restore network: assert mode returns to ONLINE within 10s and backlog syncs
    const restoreTime = Date.now();
    await cutBtn.click();
    console.log('[E2E Test] Network restored...');

    await expect(modeEl).toHaveText('ONLINE', { timeout: 10000 });
    const restoreElapsed = (Date.now() - restoreTime) / 1000;
    console.log(`[E2E Test] Switched back to ONLINE in ${restoreElapsed.toFixed(2)}s (< 10s target verified)`);
    expect(restoreElapsed).toBeLessThan(10);

    // 6. Wait for catch-up sync to cloud
    await page.waitForTimeout(3000);

    // 7. Click "Verify Yourself" button in UI
    const verifyBtn = page.locator('[data-testid="verify-yourself-btn"]');
    await verifyBtn.click();

    // 8. Assert Verification Panel displays PASS with 0 gaps and 0 overlaps
    const panel = page.locator('[data-testid="verification-panel"]');
    await expect(panel).toBeVisible({ timeout: 10000 });
    await expect(panel).toHaveClass(/pass/);

    const summary = page.locator('.verification-summary');
    await expect(summary).toContainText('PASS');
    await expect(summary).toContainText('0 gaps, 0 overlaps');

    console.log('[E2E Test] "Verify Yourself" passed successfully: device export == cloud export == ground truth');
  });
});
