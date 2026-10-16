import { test, expect } from '@playwright/test';

test.describe('30s Browser Lab Session with Network Cut & Plug Pull', () => {
  test('Runs 30s lab session, cuts network (<10s mode switch), pulls plug, asserts audit pass', async ({ page }) => {
    test.setTimeout(45000); // 45s test timeout for a 30s session

    // 1. Open Lab
    await page.goto('/#/lab', { waitUntil: 'networkidle' });
    await expect(page.locator('.lab-container')).toBeVisible({ timeout: 10000 });

    // 2. Wait for samples to start streaming and saving
    console.log('[Playwright] Waiting for engine stream to start...');
    await page.waitForTimeout(3000);

    const initialSavedText = await page.locator('[data-testid="samples-saved"]').textContent();
    console.log('[Playwright] Initial samples saved:', initialSavedText);

    // 3. Network Cut (<10s mode switch assertion)
    console.log('[Playwright] Cutting network...');
    await page.locator('[data-testid="cut-network-btn"]').click();

    // Mode must drop to OFFLINE within 10 seconds
    const modeLocator = page.locator('[data-testid="telemetry-mode"]');
    await expect(modeLocator).toHaveText('OFFLINE', { timeout: 10000 });
    console.log('[Playwright] Mode confirmed switched to OFFLINE within 10s');

    // 4. Skew Clock: Wall clock shifted by +2h without affecting engine
    console.log('[Playwright] Testing wall clock skew...');
    await page.locator('[data-testid="skew-clock-btn"]').click();
    await expect(page.locator('[data-testid="clock-skew"]')).toHaveText('+2h');

    // 5. Restore network
    console.log('[Playwright] Restoring network...');
    await page.locator('[data-testid="cut-network-btn"]').click();

    // Let stream run for 10 seconds
    await page.waitForTimeout(10000);

    // 6. Pull the plug: simulate hard crash mid-transaction
    console.log('[Playwright] Pulling the plug (hard crash simulation)...');
    await page.locator('[data-testid="pull-plug-btn"]').click();

    // Verify recovery message appears
    const auditOutput = page.locator('[data-testid="audit-output"]');
    await expect(auditOutput).toBeVisible({ timeout: 5000 });
    const recoveryText = await auditOutput.textContent();
    console.log('[Playwright] Recovery report:', recoveryText);
    expect(recoveryText).toContain('Invariants: PASS');

    // 7. Wait for worker reboot and run explicit audit
    console.log('[Playwright] Waiting for reboot and running final audit...');
    await page.waitForTimeout(5000);
    await page.locator('[data-testid="run-audit-btn"]').click();

    await expect(auditOutput).toContainText('Invariants: PASS', { timeout: 10000 });
    console.log('[Playwright] Final audit invariant PASS confirmed!');
  });
});
