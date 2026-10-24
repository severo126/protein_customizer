// Headless screenshots, checked into docs/screenshots/.
//
//   node tools/api/server.mjs &        # or ./deploy/bring-up.sh
//   node tools/screenshots.cjs
//
// Drives the seeded demo from src/data/demo.json, so the pictures in the repo
// show the same three routes the bench offers and the same splice pair the
// caption describes. Fails loudly on any console error rather than quietly
// committing a broken screenshot.

const { chromium } = require('playwright');
const { readFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = join(__dirname, '..', 'docs', 'screenshots');

(async () => {
  const demo = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'data', 'demo.json'), 'utf8'));
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });

  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text());
  });

  const shot = async (name, full = false) => {
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
    console.log(`  docs/screenshots/${name}.png`);
  };

  // The reaction cartoon runs once and holds. Pin it to a chosen millisecond
  // so the committed picture is the same frame every time.
  const freezeAt = (ms) =>
    page.evaluate((t) => {
      document.getAnimations().forEach((a) => {
        try {
          a.pause();
          a.currentTime = t;
        } catch {
          /* an animation that has already finished cannot be scrubbed */
        }
      });
    }, ms);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  console.log('Catalogue');
  await shot('1-catalogue');

  console.log('Bench — the seeded demo');
  await page.click('[data-screen="bench"]');
  for (const route of demo.routes) {
    await page.click(`[data-demo="${route.id}"]`);
    await shot(`2-bench-${route.id}`);
  }

  console.log('The reaction cartoon, frozen mid-transfer');
  await page.click('[data-demo="clean"]');
  await page.waitForTimeout(250);
  await page.click('[data-play="0"]');
  await page.waitForTimeout(250);
  await freezeAt(2650);
  await page.locator('.reaction-panel').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.locator('.reaction-panel').screenshot({ path: join(OUT, '8-reaction.png') });
  console.log('  docs/screenshots/8-reaction.png');

  console.log('The catalogue, filtered against that lane');
  await page.click('[data-screen="catalogue"]');
  await page.waitForTimeout(250);
  await page.click('#catalogue-filter');
  await shot('9-catalogue-filtered');

  console.log('Splice table');
  await page.click('[data-screen="splice"]');
  await page.selectOption('#pick-A', demo.splice.a);
  await page.selectOption('#pick-B', demo.splice.b);
  await page.selectOption('#site-A', demo.splice.site_a);
  await page.selectOption('#site-B', demo.splice.site_b);
  await shot('3-splice-pass', true);

  // The two instructive splice failures from the same caption.
  await page.fill('#linker', '2');
  await page.dispatchEvent('#linker', 'input');
  await shot('4-splice-clash');
  await page.fill('#linker', '20');
  await page.dispatchEvent('#linker', 'input');
  await shot('5-splice-compactness');

  console.log('Platform');
  await page.click('[data-screen="platform"]');
  await shot('6-platform', true);

  console.log('Limits panel');
  await page.click('#limits-button');
  await shot('7-what-this-cant-tell-you');

  await browser.close();

  if (errors.length) {
    console.error('\nConsole errors while capturing:\n' + errors.map((e) => `  ${e}`).join('\n'));
    process.exit(1);
  }
  console.log('\nAll screenshots captured with no console errors.');
})();
