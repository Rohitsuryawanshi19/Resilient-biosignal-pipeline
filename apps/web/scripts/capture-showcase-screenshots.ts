import { chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

async function capture() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const context = await browser.newContext({
    deviceScaleFactor: 2, // Retina 2x crisp screenshots
  });
  const page = await context.newPage();

  const screenshotsDir = path.resolve('..', '..', 'docs', 'screenshots');
  const responsiveDir = path.join(screenshotsDir, 'responsive');

  // 1. Desktop 1440 - Home (Hero & Bento)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(responsiveDir, 'home-1440-desktop-std.png'), fullPage: false });
  await page.screenshot({ path: path.join('public', 'og-image.png'), fullPage: false });

  // 2. Desktop 1440 - About & AI (Clean spacing, contact card)
  await page.goto('http://127.0.0.1:4173/#/about', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(responsiveDir, 'about-1440-desktop-std.png'), fullPage: false });

  // 3. Desktop 1440 - Lab (Live ECG + Control Deck)
  await page.goto('http://127.0.0.1:4173/#/lab', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, 'lab-desktop-1440.png'), fullPage: false });

  // 4. Mobile 390 - Home
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(responsiveDir, 'home-390-iphone.png'), fullPage: false });

  // 5. Mobile 390 - Lab
  await page.goto('http://127.0.0.1:4173/#/lab', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, 'lab-mobile-390.png'), fullPage: false });

  // 6. Mobile 390 - About
  await page.goto('http://127.0.0.1:4173/#/about', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(responsiveDir, 'about-390-iphone.png'), fullPage: false });

  await browser.close();
  console.log('[Screenshots] Successfully captured fresh high-resolution screenshots for Home, Lab, and About!');
}

capture().catch((err) => {
  console.error('[Screenshots Error]', err);
  process.exit(1);
});
