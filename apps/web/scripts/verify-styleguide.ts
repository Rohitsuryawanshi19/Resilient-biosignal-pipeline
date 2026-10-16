import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const AXE_SOURCE_PATH = resolve(process.cwd(), 'node_modules/axe-core/axe.min.js');
const SCREENSHOT_DIR = resolve(process.cwd(), '../../docs/screenshots');

async function main() {
  console.log('[1/4] Launching headless browser with Microsoft Edge...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  const url = 'http://127.0.0.1:4173/#/styleguide';

  console.log(`[2/4] Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('.styleguide-page', { timeout: 10000 });

  // 1. Desktop Dark
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await new Promise((r) => setTimeout(r, 600));
  const desktopDarkPath = resolve(SCREENSHOT_DIR, 'styleguide-desktop-dark.png');
  await page.screenshot({ path: desktopDarkPath, fullPage: true });
  console.log(`✓ Saved ${desktopDarkPath}`);

  // Run Axe accessibility check on dark theme
  const axeSource = readFileSync(AXE_SOURCE_PATH, 'utf8');
  await page.evaluate(axeSource);
  const darkAxeResults = await page.evaluate(async () => {
    // @ts-ignore
    return await window.axe.run({
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      },
    });
  });

  // 2. Desktop Light
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await new Promise((r) => setTimeout(r, 600));
  const desktopLightPath = resolve(SCREENSHOT_DIR, 'styleguide-desktop-light.png');
  await page.screenshot({ path: desktopLightPath, fullPage: true });
  console.log(`✓ Saved ${desktopLightPath}`);

  // Run Axe accessibility check on light theme
  const lightAxeResults = await page.evaluate(async () => {
    // @ts-ignore
    return await window.axe.run({
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      },
    });
  });

  // 3. Mobile Dark
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await new Promise((r) => setTimeout(r, 600));
  const mobileDarkPath = resolve(SCREENSHOT_DIR, 'styleguide-mobile-dark.png');
  await page.screenshot({ path: mobileDarkPath, fullPage: true });
  console.log(`✓ Saved ${mobileDarkPath}`);

  // 4. Mobile Light
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await new Promise((r) => setTimeout(r, 600));
  const mobileLightPath = resolve(SCREENSHOT_DIR, 'styleguide-mobile-light.png');
  await page.screenshot({ path: mobileLightPath, fullPage: true });
  console.log(`✓ Saved ${mobileLightPath}`);

  await browser.close();

  console.log('\n[3/4] Accessibility & Contrast Check Results:');
  console.log(`Dark Theme Violations: ${darkAxeResults.violations.length}`);
  if (darkAxeResults.violations.length > 0) {
    console.log(JSON.stringify(darkAxeResults.violations.map((v: any) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
      help: v.help,
    })), null, 2));
  }

  console.log(`\nLight Theme Violations: ${lightAxeResults.violations.length}`);
  if (lightAxeResults.violations.length > 0) {
    console.log(JSON.stringify(lightAxeResults.violations.map((v: any) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
      help: v.help,
    })), null, 2));
  }

  console.log('\n[4/4] Verification run complete!');
}

main().catch((err) => {
  console.error('Fatal in verify-styleguide:', err);
  process.exit(1);
});
