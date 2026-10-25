// Check the app the way the published link actually runs: no API server.
//
//   npm run serve            # static files only, exactly like the published copy
//   node tools/serverless-audit.cjs
//
// The published artifact has no server, so every /api/* call 404s. Twice now a
// panel has handled that by printing a developer instruction — "Start
// tools/api/server.mjs" — to whoever clicked it, once on all forty catalogue
// cards and once on the splice screen. Both were found by luck. This walks every
// screen and opens the two panels that reach for the API, so the next one is
// found on purpose.
//
// test/literature.test.js enforces the same rule statically and runs in CI.
// This script is the live check and needs playwright, which is not a dependency
// of this repo; run it where one is available.

const { chromium } = require('playwright');
const BAD = /tools\/api\/server\.mjs|is not answering|HTTP 404|\bundefined\b|\bNaN\b|\[object Object\]/;
let suspect = 0;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1150 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:5175/', { waitUntil: 'networkidle' });

  const tabs = ['Vacuum','Collection','Workstation','The bench','Splice table'];
  for (const t of tabs) {
    await p.locator('header button, nav button').filter({ hasText: t }).first().click();
    await p.waitForTimeout(700);
    const txt = await p.locator('main, #screen, body').first().innerText();
    const hits = txt.split('\n').filter(l => BAD.test(l));
    if (hits.length) suspect++;
    console.log(`${t}: ${hits.length ? 'SUSPECT → ' + JSON.stringify(hits.slice(0, 3)) : 'clean'}`);
  }

  // The two panels that reach /api/sources, exercised rather than just rendered.
  await p.locator('header button, nav button').filter({ hasText: 'Collection' }).first().click();
  await p.waitForTimeout(500);
  const src = p.locator('button', { hasText: /^Sources/ }).first();
  if (await src.count()) {
    await src.click(); await p.waitForTimeout(1500);
    const d = await p.locator('#limits-dialog').innerText();
    if (BAD.test(d)) suspect++;
  console.log('card Sources:', BAD.test(d) ? 'SUSPECT → ' + d.slice(0,200) : 'clean');
    await p.keyboard.press('Escape');
  }
  await p.locator('header button, nav button').filter({ hasText: 'Splice table' }).first().click();
  await p.waitForTimeout(500);
  const s = p.locator('#linker'); await s.fill(await s.getAttribute('min')); await s.dispatchEvent('input');
  await p.waitForTimeout(300);
  await p.locator('#explain-literature').click(); await p.waitForTimeout(1500);
  const lit = await p.locator('.lit-panel').innerText();
  if (BAD.test(lit)) suspect++;
  console.log('literature panel:', BAD.test(lit) ? 'SUSPECT → ' + lit.slice(0,200) : 'clean');
  await p.locator('#explain').click(); await p.waitForTimeout(1200);
  const pe = await p.locator('#plain-english').innerText();
  if (BAD.test(pe)) suspect++;
  console.log('plain-English (no key):', BAD.test(pe) ? 'SUSPECT → ' + pe.slice(0,160) : 'clean');
  // 404s on /api/* are expected here and are the point of the exercise: what
  // matters is that none of them reached the page as text.
  console.log('CONSOLE ERRORS (404s on /api/* are expected):', errs.length ? errs.slice(0, 5) : 'none');
  await b.close();
  console.log(suspect ? `\nFAILED: ${suspect} place(s) leaked server-side wording to the reader.` : '\nOK: nothing leaked server-side wording to the reader.');
  process.exit(suspect ? 1 : 0);
})();
