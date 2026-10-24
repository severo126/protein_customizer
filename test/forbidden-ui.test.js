// docs/scope.md §4: no sequence strip and no alignment track, in any view, not
// behind a toggle. This test greps the interface source for the markers of one
// so it cannot come back by accident.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { root, walkFiles } from './helpers.js';

const uiFiles = () => [...walkFiles(`${root}/src/ui`, ['.js', '.css', '.html']), `${root}/src/styles.css`, `${root}/index.html`];

// Identifiers a sequence viewer or alignment track would need.
const FORBIDDEN_IDENTIFIERS = [
  /\bsequence[A-Z_]?\w*\s*[=(:]/,
  /\brenderSequence\b/i,
  /\bseqViewer\b/i,
  /\bsequenceStrip\b/i,
  /\balignment\w*\s*[=(:]/i,
  /\bmsa\b/i,
  /\bfasta\b/i,
  /\bresidueTrack\b/i,
];

test('no view builds a sequence strip or an alignment track', () => {
  for (const file of uiFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN_IDENTIFIERS) {
      assert.ok(!pattern.test(text), `${file} matches a forbidden sequence-viewer marker: ${pattern}`);
    }
  }
});

test('the interface never offers a validated or approved state', () => {
  // The words may appear only in a sentence that denies them ("there is no
  // validated state"), which is how the limits panel explains the rule.
  for (const file of uiFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const word of ['validated', 'approved', 'verified']) {
      const re = new RegExp(`\\b${word}\\b`, 'gi');
      for (const m of text.matchAll(re)) {
        const context = text.slice(Math.max(0, m.index - 60), m.index);
        assert.match(context, /\b(no|not|never)\b/i, `${file} offers a "${word}" state — there is no such state in this app`);
      }
    }
  }
});

test('the standing cartoon note is on the page itself, not only in a dialog', () => {
  const html = readFileSync(`${root}/index.html`, 'utf8');
  assert.match(html, /classroom cartoon/i);
  assert.match(html, /order-of-magnitude-wrong physics/i);
  assert.match(html, /No sequences anywhere/i);
  // The limits panel is reachable from every screen because it lives in the
  // top bar, which is outside the screen container.
  assert.match(html, /id="limits-button"/);
  const topbarEnd = html.indexOf('</header>');
  assert.ok(html.indexOf('id="limits-button"') < topbarEnd, 'the limits button must sit in the top bar');
});
