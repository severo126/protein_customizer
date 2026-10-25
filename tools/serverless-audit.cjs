// Check the app the way the published link actually runs: no API server.
//
//   npm run serve            # static files only, exactly like the published copy
//   npm run audit:serverless
//
// PORT is read the same way tools/serve.mjs reads it, so the two agree by
// default; PORT=5174 on both if 5173 is taken.
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
// Same default as tools/serve.mjs. Hardcoding a port here once meant the
// documented invocation could not connect at all.
const PORT = Number(process.env.PORT ?? 5173);
const BASE = `http://localhost:${PORT}/`;
let suspect = 0;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1150 } });
  const errs = [];
  console.log(`Auditing ${BASE} with no API server behind it.\n`);
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  // A page that never loaded is not a clean audit and it is not a caught leak
  // either. Say which it is, because a gate that cannot tell them apart is worse
  // than no gate: it cries wolf on a connection error and gets ignored.
  try {
    await p.goto(BASE, { waitUntil: 'networkidle' });
  } catch (err) {
    console.error(`COULD NOT CHECK: nothing answered at ${BASE} (${err.message.split('\n')[0]}).`);
    console.error('Start the static server first: npm run serve' + (PORT === 5173 ? '' : ` (PORT=${PORT})`));
    await b.close();
    process.exit(2);
  }

  // Tabs are read off the page, never listed here. A hardcoded list silently
  // stopped matching when the screens were renamed, so this gate passed nothing
  // and failed loudly only by luck — exactly the "looks like it ran" failure the
  // exit codes below exist to prevent.
  const tabs = await p.$$eval('#tabs button', (els) =>
    els.map((e) => ({ label: e.textContent.trim(), screen: e.dataset.screen })).filter((t) => t.label),
  );
  if (!tabs.length) {
    console.error('COULD NOT CHECK: no tabs found in #tabs — the page loaded but is not the app.');
    await b.close();
    process.exit(2);
  }

  // A control that has moved or been renamed means this audit did not look at
  // what it claims to look at. That is a "could not check", not a pass.
  const missing = [];

  for (const t of tabs) {
    await p.locator(`#tabs button[data-screen="${t.screen}"]`).click();
    await p.waitForTimeout(700);
    const txt = await p.locator('main, #screen, body').first().innerText();
    const hits = txt.split('\n').filter((l) => BAD.test(l));
    if (hits.length) suspect++;
    console.log(`${t.label}: ${hits.length ? 'SUSPECT → ' + JSON.stringify(hits.slice(0, 3)) : 'clean'}`);
  }

  const goTo = async (screen) => {
    const tab = tabs.find((t) => t.screen === screen);
    if (!tab) return false;
    await p.locator(`#tabs button[data-screen="${screen}"]`).click();
    await p.waitForTimeout(500);
    return true;
  };

  // The panels that reach /api/sources, exercised rather than merely rendered.
  if (await goTo('collection')) {
    const src = p.locator('button', { hasText: /^Sources/ }).first();
    if (await src.count()) {
      await src.click();
      await p.waitForTimeout(1500);
      const d = await p.locator('#limits-dialog').innerText();
      if (BAD.test(d)) suspect++;
      console.log('card Sources:', BAD.test(d) ? 'SUSPECT → ' + d.slice(0, 200) : 'clean');
      await p.keyboard.press('Escape');
    } else {
      missing.push('the Sources button on a collection card');
    }
  } else {
    missing.push('the collection screen');
  }

  if (await goTo('splice')) {
    const slider = p.locator('#linker');
    if (await slider.count()) {
      await slider.fill(await slider.getAttribute('min'));
      await slider.dispatchEvent('input');
      await p.waitForTimeout(300);
    } else {
      missing.push('the linker slider');
    }

    const litBtn = p.locator('#explain-literature');
    if (await litBtn.count()) {
      await litBtn.click();
      await p.waitForTimeout(1500);
      const lit = await p.locator('.lit-panel').innerText();
      if (BAD.test(lit)) suspect++;
      console.log('literature panel:', BAD.test(lit) ? 'SUSPECT → ' + lit.slice(0, 200) : 'clean');
    } else {
      missing.push('the "what does the literature say" button (is the verdict a rejection?)');
    }

    const explain = p.locator('#explain');
    if (await explain.count()) {
      await explain.click();
      await p.waitForTimeout(1200);
      const pe = await p.locator('#plain-english').innerText();
      if (BAD.test(pe)) suspect++;
      console.log('plain-English (no key):', BAD.test(pe) ? 'SUSPECT → ' + pe.slice(0, 160) : 'clean');
    } else {
      missing.push('the plain-English button');
    }
  } else {
    missing.push('the splice screen');
  }

  // 404s on /api/* are expected here and are the point of the exercise: what
  // matters is that none of them reached the page as text.
  console.log('CONSOLE ERRORS (404s on /api/* are expected):', errs.length ? errs.slice(0, 5) : 'none');
  await b.close();

  if (missing.length) {
    console.error(`\nCOULD NOT CHECK: this audit never reached ${missing.join(', ')}.`);
    console.error('Whatever it did check says nothing about those. Update the selectors in this file.');
    process.exit(2);
  }
  console.log(suspect ? `\nFAILED: ${suspect} place(s) leaked server-side wording to the reader.` : '\nOK: nothing leaked server-side wording to the reader.');
  process.exit(suspect ? 1 : 0);
})();
