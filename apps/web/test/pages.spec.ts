import { test, expect } from '@playwright/test';

test.describe('All 5 Pages Navigation and Interactive Features', () => {
  test('1. Home (/) renders spatial scene, metrics, and interactive Recruiter Tour', async ({ page }) => {
    await page.goto('/#/', { waitUntil: 'networkidle' });

    // Header & title
    await expect(page.locator('.hero-title')).toContainText('Zero-Data-Loss');
    await expect(page.locator('.hero-metrics-grid')).toBeVisible();

    // 3D Spatial scene cards
    await expect(page.locator('.layer-ecg')).toBeVisible();
    await expect(page.locator('.layer-ledger')).toBeVisible();
    await expect(page.locator('.layer-toggle')).toBeVisible();

    // Open Recruiter Tour
    const tourBtn = page.getByRole('button', { name: /Recruiter Tour/i });
    await expect(tourBtn).toBeVisible();
    await tourBtn.click();

    // Verify modal appears
    await expect(page.locator('.tour-modal')).toBeVisible();
    await expect(page.locator('.tour-progress')).toContainText('Step 1 of 6');

    // Step through tour via keyboard
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.tour-progress')).toContainText('Step 2 of 6');

    // Close tour with Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('.tour-modal')).not.toBeVisible();
  });

  test('2. Proof (/proof) renders 8 criteria, 4 resource gauges, and real timeline replay', async ({ page }) => {
    await page.goto('/#/proof', { waitUntil: 'networkidle' });

    await expect(page.locator('.proof-title')).toContainText('8 Completion Criteria');

    // 4 Resource gauges
    const gauges = page.locator('.neu-gauge-container');
    await expect(gauges).toHaveCount(4);

    // 8 Criteria rows
    const criteriaRows = page.locator('.criterion-row');
    await expect(criteriaRows).toHaveCount(8);

    // Timeline player
    const replayBtn = page.getByRole('button', { name: /Replay Timeline/i });
    await expect(replayBtn).toBeVisible();

    // Play next event
    const nextBtn = page.getByRole('button', { name: /Next/i });
    await nextBtn.click();
    await expect(page.locator('.active-event-card')).toBeVisible();
  });

  test('3. Architecture (/architecture) renders interactive diagram and Network Cut toggle', async ({ page }) => {
    await page.goto('/#/architecture', { waitUntil: 'networkidle' });

    await expect(page.locator('.arch-title')).toContainText('Interactive Systems Architecture');
    await expect(page.locator('.diagram-canvas')).toBeVisible();

    // Click node inspector
    const readerNode = page.locator('.arch-node', { hasText: 'TCP Reader' });
    await readerNode.click();
    await expect(page.locator('.inspector-role')).toContainText(':7100');

    // Simulate Network Cut
    const cutToggle = page.getByRole('button', { name: /Simulate Network Cut/i });
    await cutToggle.click();
    await expect(page.locator('.buffering-badge')).toBeVisible();
    await expect(page.locator('.severed-cross')).toBeVisible();

    // Restore network
    const restoreBtn = page.getByRole('button', { name: /Restore Network Link/i });
    await restoreBtn.click();
    await expect(page.locator('.buffering-badge')).not.toBeVisible();
  });

  test('4. Engineering (/engineering) renders trade-offs, accounting identity, BUGS_FOUND cards, and budget', async ({ page }) => {
    await page.goto('/#/engineering', { waitUntil: 'networkidle' });

    await expect(page.locator('.eng-title')).toContainText('Engineering Rigor');
    await expect(page.locator('.tradeoff-table')).toBeVisible();
    await expect(page.locator('.formula-display')).toContainText('U = S ∪ L');

    // 6 Bug cards
    const bugCards = page.locator('.bug-card');
    await expect(bugCards).toHaveCount(6);

    // Free tier budget table
    await expect(page.locator('.budget-table')).toBeVisible();
  });

  test('5. About (/about) renders AI disclosure, tech stack, and MIT license', async ({ page }) => {
    await page.goto('/#/about', { waitUntil: 'networkidle' });

    await expect(page.locator('.about-title')).toContainText('AI Transparency');
    await expect(page.locator('.ai-disclosure-content')).toBeVisible();
    await expect(page.locator('.tech-stack-grid')).toBeVisible();
    await expect(page.locator('.license-badge')).toContainText('MIT LICENSE');
  });
});
