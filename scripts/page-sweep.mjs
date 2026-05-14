import { chromium } from '@playwright/test';
import fs from 'node:fs';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const routes = [
  '/',
  '/script',
  '/storyboard',
  '/storyboard-copilot',
  '/assets',
  '/video',
  '/dubbing',
  '/sample',
  '/prompt-settings',
  '/settings',
];

const results = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function probeRoute(browser, route) {
  const page = await browser.newPage();
  const errors = [];

  page.on('pageerror', (error) => {
    errors.push({
      type: 'pageerror',
      message: error?.message || String(error),
    });
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push({
        type: 'console.error',
        message: msg.text(),
      });
    }
  });

  const entry = {
    route,
    ok: true,
    actions: 0,
    errors,
    fatal: null,
  };

  try {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(300);

    const selectors = [
      'button:not([disabled])',
      '[role="button"]',
      '[role="tab"]',
      'a[href]:not([href^="http"])',
      'input:not([disabled]):not([type="hidden"])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      '[data-state]'
    ];

    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      const count = await page.locator(selector).count();
      if (count === 0) {
        continue;
      }

      const maxClicks = Math.min(count, 3);
      for (let i = 0; i < maxClicks; i += 1) {
        const target = page.locator(selector).nth(i);
        try {
          await target.scrollIntoViewIfNeeded({ timeout: 1000 });
          const tagName = await target.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
          if (tagName === 'input' || tagName === 'textarea') {
            await target.click({ timeout: 1000 });
            await target.fill('smoke').catch(() => {});
          } else if (tagName === 'select') {
            const options = await target.locator('option').count().catch(() => 0);
            if (options > 1) {
              await target.selectOption({ index: 1 }).catch(() => {});
            } else {
              await target.click({ timeout: 1000 }).catch(() => {});
            }
          } else {
            await target.click({ timeout: 1000 }).catch(() => {});
          }
          entry.actions += 1;
          await page.keyboard.press('Escape').catch(() => {});
          await sleep(120);
        } catch {
          // keep sweeping
        }
      }
    }

    await sleep(350);
    entry.ok = errors.length === 0;
  } catch (error) {
    entry.ok = false;
    entry.fatal = error?.message || String(error);
  } finally {
    await page.close();
  }

  return entry;
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    for (const route of routes) {
      const result = await probeRoute(browser, route);
      results.push(result);
    }
  } finally {
    await browser.close();
  }

  const errorCount = results.reduce((sum, r) => sum + r.errors.length + (r.fatal ? 1 : 0), 0);
  const payload = {
    baseUrl,
    routeCount: routes.length,
    errorCount,
    results,
  };

  fs.writeFileSync('test-results/page-sweep.json', JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
