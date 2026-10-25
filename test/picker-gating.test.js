// What the picker's chips promise, checked against what the search would say.
//
// Each chip now carries a count: how many molecules this catalogue can still
// reach if you press it. That is a claim the screen makes before anything has
// been searched, so it has to be the same claim the search makes afterwards.
// The load-bearing tests here press every chip, for every draft, and check
// three things line up: the chip's count, the map's own count for the draft
// that press produces, and whether `searchRoutes` then finds anything.
//
// A chip that said "nothing behind this" where a route exists would be the
// worst failure in the app — it would hide a real answer behind a warning —
// so the no-false-dead-end direction is asserted exhaustively rather than on
// a sample.

import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue } from './helpers.js';
import { pickerOptions } from '../src/model/picker.js';
import { makeTarget, searchRoutes } from '../src/model/routes.js';
import { exploreCatalogue, mapFor, chipOutlook, deadReason, stuckNote } from '../src/model/route-map.js';

const entries = catalogue.entries;
const OPTS = pickerOptions(entries);

// One walk for the file, the same way the screen keeps one.
const EX = exploreCatalogue(entries);

const DRAFTS = [
  { core: 'glucose', groups: [], match: 'carries' },
  { core: 'glucose', groups: ['phosphate'], match: 'carries' },
  { core: 'glucose', groups: ['phosphate', 'phosphate'], match: 'carries' },
  { core: 'glucose', groups: ['hydroxyl', 'hydroxyl', 'hydroxyl'], match: 'exact' },
  { core: 'glycine', groups: [], match: 'carries' },
  { core: 'glycine', groups: ['phosphate'], match: 'carries' },
  { core: 'urea', groups: [], match: 'carries' },
  { core: 'peroxide', groups: [], match: 'carries' },
  { core: 'fructose', groups: ['methyl'], match: 'carries' },
  { core: 'malate', groups: [], match: 'carries' },
];

const withGroup = (d, g) => ({ ...d, groups: [...d.groups, g] });

/* ----------------------- the count is the map's count ---------------------- */

test('a chip’s count is the number the map would report once it is pressed', () => {
  for (const draft of DRAFTS) {
    const outlook = chipOutlook(EX, draft, OPTS);
    assert.equal(outlook.current, mapFor(EX, draft).matchCount, `current count for ${JSON.stringify(draft)}`);

    for (const g of OPTS.groups) {
      if (draft.groups.length >= OPTS.maxGroups) continue;
      const after = mapFor(EX, withGroup(draft, g.id));
      assert.equal(
        outlook.groups.get(g.id).count,
        after.matchCount,
        `${g.id} on ${JSON.stringify(draft)}: chip says ${outlook.groups.get(g.id).count}, map says ${after.matchCount}`,
      );
    }

    for (const mode of ['carries', 'exact']) {
      const after = mapFor(EX, { ...draft, match: mode });
      assert.equal(outlook.modes.get(mode).count, after.matchCount, `${mode} on ${JSON.stringify(draft)}`);
    }
  }
});

test('a skeleton’s count is the number the map would report once it is chosen', () => {
  const draft = { core: 'glucose', groups: ['phosphate'], match: 'carries' };
  const outlook = chipOutlook(EX, draft, OPTS);
  for (const c of OPTS.cores) {
    const after = mapFor(EX, { ...draft, core: c.id });
    assert.equal(outlook.cores.get(c.id).count, after.matchCount, `skeleton ${c.id}`);
  }
});

/* --------------------- no chip hides a route that exists ------------------- */

test('every chip the picker would mark dead really does leave the search nothing', () => {
  let checked = 0;
  for (const draft of DRAFTS) {
    const outlook = chipOutlook(EX, draft, OPTS);
    if (outlook.current === 0) continue; // already stuck; the chips are moot
    for (const g of OPTS.groups) {
      if (outlook.groups.get(g.id).count !== 0) continue;
      const next = withGroup(draft, g.id);
      const found = searchRoutes(entries, makeTarget(next));
      assert.equal(
        found.routes.length,
        0,
        `${g.id} on ${JSON.stringify(draft)} is marked dead but the search found ${found.routes.length} routes`,
      );
      checked += 1;
    }
  }
  // If this ever drops to zero the assertion above is vacuous and the test is
  // guarding nothing, so the count itself is asserted.
  assert.ok(checked >= 20, `expected a useful number of dead chips to check, got ${checked}`);
});

test('every chip the picker leaves open really does lead somewhere the search can get', () => {
  let checked = 0;
  for (const draft of DRAFTS.slice(0, 6)) {
    const outlook = chipOutlook(EX, draft, OPTS);
    if (outlook.current === 0) continue;
    for (const g of OPTS.groups) {
      const n = outlook.groups.get(g.id).count;
      if (n === 0) continue;
      const next = withGroup(draft, g.id);
      const found = searchRoutes(entries, makeTarget(next));
      assert.ok(
        found.routes.length > 0,
        `${g.id} on ${JSON.stringify(draft)} is offered with ${n} behind it, but the search found nothing`,
      );
      checked += 1;
    }
  }
  assert.ok(checked >= 20, `expected a useful number of live chips to check, got ${checked}`);
});

test('a skeleton the picker would disable really does leave the search nothing', () => {
  const draft = { core: 'glucose', groups: ['peroxide'], match: 'carries' };
  const outlook = chipOutlook(EX, draft, OPTS);
  const dead = [...outlook.cores.entries()].filter(([, v]) => v.count === 0).map(([k]) => k);
  assert.ok(dead.length >= 10, `expected most skeletons to be dead for ${JSON.stringify(draft)}, got ${dead.length}`);
  for (const core of dead) {
    const found = searchRoutes(entries, makeTarget({ ...draft, core }));
    assert.equal(found.routes.length, 0, `${core} is disabled but the search found a route`);
  }
});

/* ------------------------- the already-stuck draft ------------------------- */

test('once the draft matches nothing, every chip counts zero, which is why none is blamed', () => {
  const draft = { core: 'glucose', groups: ['peroxide'], match: 'carries' };
  const outlook = chipOutlook(EX, draft, OPTS);
  assert.equal(outlook.current, 0);
  for (const g of OPTS.groups) {
    assert.equal(outlook.groups.get(g.id).count, 0, `${g.id} should be zero once the draft is already stuck`);
  }
  // And the map agrees it is a dead end rather than an empty picture.
  const map = mapFor(EX, draft);
  assert.equal(map.reachable, false);
  assert.ok(map.nodes.some((n) => n.isTarget && n.unreachable), 'the asked-for molecule is still drawn');
});

test('the chip counts do not depend on the order the drafts were asked about', () => {
  const a = chipOutlook(EX, DRAFTS[1], OPTS);
  chipOutlook(EX, DRAFTS[5], OPTS);
  const b = chipOutlook(EX, DRAFTS[1], OPTS);
  assert.deepEqual([...a.groups.entries()], [...b.groups.entries()]);
  assert.equal(a.current, b.current);
});

test('a draft with no skeleton yet offers no group or mode counts, and no chip is held back', () => {
  const outlook = chipOutlook(EX, { core: null, groups: [], match: 'carries' }, OPTS);
  assert.equal(outlook.core, null);
  assert.equal(outlook.groups.size, 0);
  assert.equal(outlook.modes.size, 0);
  assert.equal(outlook.cores.size, OPTS.cores.length);
});

test('at the group cap the chips stop pretending another group could be added', () => {
  const full = { core: 'glucose', groups: Array(OPTS.maxGroups).fill('hydroxyl'), match: 'carries' };
  const outlook = chipOutlook(EX, full, OPTS);
  assert.equal(outlook.atCap, true);
  for (const g of OPTS.groups) {
    assert.equal(outlook.groups.get(g.id).count, outlook.current, `${g.id} at the cap`);
  }
});

/* ------------------------------- what it says ------------------------------ */

const VERDICT =
  /\b(viable|valid|validated|approve[ds]?|safe|unsafe|stable|unstable|optimal|guaranteed|proven|will work|should work|efficient|yield)\b/i;

test('the reason on a dead chip names what closed the door, and gives no verdict', () => {
  const drafts = [
    { core: 'glucose', groups: [], match: 'carries' },
    { core: 'glucose', groups: ['phosphate'], match: 'carries' },
    { core: 'glucose', groups: ['phosphate', 'methyl'], match: 'carries' },
  ];
  for (const draft of drafts) {
    for (const kind of ['core', 'group', 'mode']) {
      const text = deadReason(kind, 'peroxide', draft);
      assert.ok(text.length > 20, `${kind} reason is too short to be a reason: ${text}`);
      assert.ok(!VERDICT.test(text), `${kind} reason reads as a verdict: ${text}`);
      assert.ok(/catalogue|reach/i.test(text), `${kind} reason should say it is about this catalogue: ${text}`);
    }
    // The group reason names the group, because "no" without a subject is the
    // thing the chips exist to stop.
    assert.match(deadReason('group', 'peroxide', draft), /peroxide/);
  }
});

test('the stuck note tells you what to undo rather than only that you are stuck', () => {
  for (const draft of [
    { core: 'glucose', groups: ['peroxide'], match: 'carries' },
    { core: 'glucose', groups: ['hydroxyl'], match: 'exact' },
    { core: 'glucose', groups: [], match: 'exact' },
  ]) {
    const text = stuckNote(draft);
    assert.ok(!VERDICT.test(text), `stuck note reads as a verdict: ${text}`);
    assert.match(text, /take a group off|change the reading|read it as/i, `stuck note offers no way out: ${text}`);
  }
});
