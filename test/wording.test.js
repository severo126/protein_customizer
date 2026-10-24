// The report format is non-negotiable (docs/scope.md §3), so it is pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { root, byId } from './helpers.js';
import { PASS_VERDICT, NOT_CHECKED, CARTOON_PHYSICS_NOTE, FORBIDDEN_VERDICT_WORDS } from '../src/model/disclaimers.js';
import { runFilters, spliceFunnel } from '../src/model/splice.js';
import { exportConstruct, exportPipeline } from '../src/model/exportConstruct.js';
import { runPipeline } from '../src/model/pipeline.js';
import { teamReport } from '../src/model/compatibility.js';
import { starter } from '../src/model/molecules.js';

test('the pass verdict is exactly the agreed wording', () => {
  assert.equal(PASS_VERDICT, 'Nothing here ruled this out');
  for (const word of FORBIDDEN_VERDICT_WORDS) {
    assert.ok(!new RegExp(word, 'i').test(PASS_VERDICT));
  }
});

test('the not-checked list covers everything the brief names', () => {
  const joined = NOT_CHECKED.join(' ').toLowerCase();
  for (const item of ['folding kinetics', 'side-chain packing', 'expression', 'solubility', 'aggregation', 'activity retention', 'allostery', 'cellular context', 'safety']) {
    assert.ok(joined.includes(item), `the not-checked list is missing "${item}"`);
  }
});

test('the cartoon-physics note says all three things it has to say', () => {
  assert.match(CARTOON_PHYSICS_NOTE, /order-of-magnitude-wrong physics/);
  assert.match(CARTOON_PHYSICS_NOTE, /did not rule it out/);
  assert.match(CARTOON_PHYSICS_NOTE, /fold, function, or be safe/);
});

test('every exported construct carries the disclaimer and the standing list', () => {
  const a = byId('lipase');
  const b = byId('alpha-amylase');
  const f = spliceFunnel(a, b);
  for (const c of [f.candidates[0], f.survivors[0] ?? f.candidates.at(-1)]) {
    const payload = exportConstruct({ entryA: a, siteA: c.siteA, entryB: b, siteB: c.siteB, linkerUnits: c.linkerUnits, verdict: c });
    assert.equal(payload.disclaimer, CARTOON_PHYSICS_NOTE);
    assert.deepEqual(payload.not_checked, NOT_CHECKED);
    assert.ok(payload.not_a_design.includes('not a protein design'));
    assert.ok(payload.verdict === PASS_VERDICT || payload.verdict === 'Ruled out by this toy');
  }
});

test('every exported run carries the disclaimer, and the score says it is made up', () => {
  const entries = [byId('hexokinase'), byId('alkaline-phosphatase')];
  const run = runPipeline(starter('glucose'), entries);
  const payload = exportPipeline({ run, entries, team: teamReport(entries, run) });
  assert.equal(payload.disclaimer, CARTOON_PHYSICS_NOTE);
  assert.match(payload.foundry_score.disclaimer, /made-up number/);
  assert.deepEqual(payload.not_checked, NOT_CHECKED);
});

test('a passing candidate never gets a stronger word than the agreed one', () => {
  const a = byId('lipase');
  const b = byId('alpha-amylase');
  const f = spliceFunnel(a, b);
  assert.ok(f.survivors.length);
  for (const s of f.survivors) {
    const payload = exportConstruct({ entryA: a, siteA: s.siteA, entryB: b, siteB: s.siteB, linkerUnits: s.linkerUnits, verdict: s });
    assert.equal(payload.verdict, PASS_VERDICT);
    for (const word of FORBIDDEN_VERDICT_WORDS) {
      assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(payload.verdict), `verdict contains "${word}"`);
    }
  }
});

test('the splice screen shows the verdict and the standing list together', () => {
  const view = readFileSync(`${root}/src/ui/splice-view.js`, 'utf8');
  assert.match(view, /PASS_VERDICT/);
  assert.match(view, /NOT_CHECKED/);
  assert.match(view, /CARTOON_PHYSICS_NOTE/);
  assert.match(view, /absence of a red flag from a cartoon/);
});

test('docs/scope.md states the limits the data layer enforces', () => {
  const scope = readFileSync(`${root}/docs/scope.md`, 'utf8').toLowerCase();
  for (const claim of ['no user-upload path', 'no live search', 'nothing here ruled this out', 'no alignment track', 'no horizontal amino-acid sequence strip']) {
    assert.ok(scope.includes(claim), `docs/scope.md does not state: ${claim}`);
  }
});
