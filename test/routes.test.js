import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue } from './helpers.js';
import { starter, STARTERS } from '../src/model/molecules.js';
import { runPipeline } from '../src/model/pipeline.js';
import {
  searchRoutes,
  scanFromStarter,
  makeTarget,
  validateTarget,
  targetVocabulary,
  reachableCores,
  reachableGroups,
  matchesTarget,
  rankRoutes,
  routeMetrics,
  searchHeadline,
  describeTarget,
  CRITERIA,
  SEARCH_LIMITS,
} from '../src/model/routes.js';

const entries = catalogue.entries;
const byId = new Map(entries.map((e) => [e.id, e]));

// A target that exists: glucose, phosphorylated and isomerised to fructose.
const FRUCTOSE_P = makeTarget({ core: 'fructose', groups: ['phosphate', 'hydroxyl', 'hydroxyl', 'hydroxyl'] });

/* ---------------------------------------------------------------------------
 * The load-bearing test. Every route the search hands back has to be a route
 * the bench will actually play, stage for stage, because the whole claim of
 * this screen is that the chains come from a search over the catalogue rather
 * than from a model. If the search could return a chain the bench refuses, a
 * route could be shown that does not exist, which is the exact failure the
 * deterministic split is there to prevent.
 * ------------------------------------------------------------------------- */

test('every route the search returns is one the bench runs to completion, with the same molecules', () => {
  const result = searchRoutes(entries, FRUCTOSE_P);
  assert.ok(result.routes.length > 0, 'expected this target to be reachable');

  for (const route of result.routes) {
    const stageEntries = route.stages.map((id) => byId.get(id));
    assert.ok(
      stageEntries.every(Boolean),
      `route ${route.id} names an enzyme that is not in the catalogue`,
    );

    const run = runPipeline(starter(route.starterId), stageEntries);
    assert.equal(run.stalled, false, `the bench stalls on route ${route.id}`);

    // The molecule list the route carries must be exactly what the bench
    // computes: the starter, then the product of each stage.
    const benchMolecules = [run.start, ...run.stages.map((s) => s.product)];
    assert.equal(route.molecules.length, benchMolecules.length, `route ${route.id} has the wrong number of molecules`);
    benchMolecules.forEach((mol, i) => {
      assert.equal(route.molecules[i].core, mol.core, `route ${route.id} molecule ${i} has a different core`);
      assert.deepEqual(
        [...route.molecules[i].groups].sort(),
        [...mol.groups].sort(),
        `route ${route.id} molecule ${i} carries different groups`,
      );
    });

    // And the last molecule has to be the thing that was asked for.
    assert.ok(matchesTarget(run.product, route.target), `route ${route.id} does not end on the target`);
  }
});

test('a route never names an enzyme twice in a row doing nothing, and never revisits a molecule', () => {
  const result = searchRoutes(entries, FRUCTOSE_P);
  for (const route of result.routes) {
    const keys = route.molecules.map((m) => `${m.core}|${[...m.groups].sort().join(',')}`);
    assert.equal(new Set(keys).size, keys.length, `route ${route.id} passes through the same molecule twice`);
  }
});

/* ------------------------------ what it finds ----------------------------- */

test('the known two-stage route to a phosphorylated fructose is found, both ways round', () => {
  const result = searchRoutes(entries, FRUCTOSE_P);
  assert.equal(result.reachable, true);
  assert.equal(result.shortestDepth, 2);

  const ids = result.routes.map((r) => r.id);
  assert.ok(ids.includes('glucose>hexokinase>glucose-isomerase'), 'phosphate first, then isomerise');
  assert.ok(ids.includes('glucose>glucose-isomerase>hexokinase'), 'isomerise first, then phosphate');
});

test('all three kinases that hang a phosphate on a hydroxyl turn up as alternatives', () => {
  const result = searchRoutes(entries, FRUCTOSE_P);
  const used = new Set(result.routes.flatMap((r) => r.stages));
  for (const id of ['hexokinase', 'glucokinase', 'glycerol-kinase']) {
    assert.ok(used.has(id), `${id} should appear in at least one route`);
  }
});

test('a reachable target reports which starting molecules get there, and in how many stages', () => {
  const result = searchRoutes(entries, makeTarget({ core: 'malate', groups: ['sulfate'], match: 'carries' }));
  assert.equal(result.reachable, true);
  assert.ok(result.reachedFrom.length >= 1);
  for (const r of result.reachedFrom) {
    assert.ok(STARTERS.some((s) => s.id === r.starterId), `${r.starterId} is not a starting molecule`);
    assert.ok(r.stages >= 1 && r.stages <= SEARCH_LIMITS.maxDepth);
  }
  assert.equal(result.shortestDepth, Math.min(...result.reachedFrom.map((r) => r.stages)));
  assert.equal(result.longestShortest, Math.max(...result.reachedFrom.map((r) => r.stages)));
});

/* ---------------------------- the honest dead end ------------------------- */

test('an unreachable target says so, and says the search finished rather than gave up', () => {
  const target = makeTarget({ core: 'amide', groups: ['amine'], match: 'carries' });
  const result = searchRoutes(entries, target);

  assert.equal(result.reachable, false);
  assert.deepEqual(result.routes, []);
  assert.equal(result.totalFound, 0);
  // The claim "nothing reaches this" is only honest when the walk completed.
  assert.equal(result.scan.exhausted, true);
  assert.ok(result.scan.statesSeen > 100, 'the scan should have walked a real state space');
  assert.ok(result.nearMisses.length > 0, 'a dead end has to report how close it got');
});

test('the dead-end headline never claims more than the stage limit allows, and never says a route exists', () => {
  const result = searchRoutes(entries, makeTarget({ core: 'amide', groups: ['amine'], match: 'carries' }));
  const line = searchHeadline(result);
  assert.match(line, new RegExp(`up to ${SEARCH_LIMITS.maxDepth} catalogue stages`));
  assert.match(line, /closest it came/);
  // No wording that would read as a route having been found.
  assert.doesNotMatch(line, /\broute(s)? to\b/i);
});

test('when the scan runs out of budget the headline refuses to call it a dead end', () => {
  // A deliberately tiny budget, so the walk cannot finish. The point is that
  // this is reported as an unfinished search rather than as "no route".
  const result = searchRoutes(entries, makeTarget({ core: 'amide', groups: ['amine'], match: 'carries' }), {
    maxScanNodes: 50,
  });
  assert.equal(result.scan.exhausted, false);
  assert.equal(result.reachable, false);
  const line = searchHeadline(result);
  assert.match(line, /did not finish/);
  assert.doesNotMatch(line, /Nothing the forty entries can do/);
  assert.doesNotMatch(line, /No chain of up to/);
});

test('a near miss reports a molecule the search actually stood in', () => {
  const result = searchRoutes(entries, makeTarget({ core: 'amide', groups: ['amine'], match: 'carries' }));
  for (const near of result.nearMisses) {
    assert.ok(typeof near.molecule.core === 'string' && near.molecule.core.length > 0);
    assert.ok(Array.isArray(near.molecule.groups));
    assert.ok(near.distance.total > 0, 'a near miss is by definition not the target');
    assert.ok(STARTERS.some((s) => s.id === near.starterId));
  }
});

/* ----------------------- the vocabulary stays the catalogue's ------------- */

test('the target vocabulary is derived from the catalogue, not written out by hand', () => {
  const vocab = targetVocabulary(entries);
  const starterCores = new Set(STARTERS.map((s) => s.core));
  const rearrangeTo = new Set(entries.filter((e) => e.action.op === 'rearrange').map((e) => e.action.to));

  for (const core of vocab.cores) {
    assert.ok(starterCores.has(core) || rearrangeTo.has(core), `${core} is neither a starter nor any rule's product`);
  }
  // Every rearrange product whose input is reachable has to be offered.
  for (const e of entries) {
    if (e.action.op === 'rearrange' && vocab.cores.includes(e.action.from)) {
      assert.ok(vocab.cores.includes(e.action.to), `${e.action.to} is reachable but not offered`);
    }
  }
});

test('every group in the vocabulary is one some catalogue rule or starter actually puts on a molecule', () => {
  const groups = new Set(reachableGroups(entries));
  const accounted = new Set();
  for (const s of STARTERS) for (const g of s.groups) accounted.add(g);
  for (const e of entries) {
    const a = e.action;
    if (a.op === 'add' || a.op === 'join') accounted.add(a.group);
    if (a.op === 'remove' && a.yields) accounted.add(a.yields);
  }
  for (const g of groups) assert.ok(accounted.has(g), `${g} is offered but nothing produces it`);
});

test('a target naming something outside the catalogue is refused with a reason', () => {
  const bad = validateTarget(entries, makeTarget({ core: 'unobtainium', groups: ['hydroxyl'] }));
  assert.equal(bad.ok, false);
  assert.ok(bad.problems.some((p) => /Unobtainium|unobtainium/.test(p)));

  const badGroup = validateTarget(entries, makeTarget({ core: 'glucose', groups: ['plutonium'] }));
  assert.equal(badGroup.ok, false);
  assert.ok(badGroup.problems.some((p) => /plutonium/.test(p)));

  const fine = validateTarget(entries, FRUCTOSE_P);
  assert.equal(fine.ok, true);
  assert.deepEqual(fine.problems, []);
});

test('a target asking for more groups than the search caps at is refused rather than silently truncated', () => {
  const tooMany = validateTarget(
    entries,
    makeTarget({ core: 'glucose', groups: new Array(SEARCH_LIMITS.maxGroups + 1).fill('hydroxyl') }),
  );
  assert.equal(tooMany.ok, false);
  assert.ok(tooMany.problems.some((p) => /cap/.test(p)));
});

/* ------------------------------- the metrics ------------------------------ */

test('route metrics read committed catalogue fields and nothing else', () => {
  const result = searchRoutes(entries, FRUCTOSE_P);
  for (const route of result.routes) {
    const m = routeMetrics(entries, route);
    const stageEntries = route.stages.map((id) => byId.get(id));

    assert.equal(m.stages, stageEntries.length);

    // Supply load counts distinct cofactor pools plus distinct host needs.
    const needs = new Set(stageEntries.flatMap((e) => e.needs ?? []));
    assert.deepEqual(m.needs, [...needs].sort());
    assert.equal(m.supplyLoad, m.cofactors.length + m.needs.length);

    // A shared window is the arithmetic intersection of the stated windows.
    const low = Math.max(...stageEntries.map((e) => e.temp[0]));
    const high = Math.min(...stageEntries.map((e) => e.temp[1]));
    if (high < low) {
      assert.equal(m.tempEmpty, true);
      assert.equal(m.tempWindow, null);
      assert.ok(m.tempBlame, 'an empty window has to name the two stages that closed it');
    } else {
      assert.equal(m.tempEmpty, false);
      assert.equal(m.tempWindow.low, low);
      assert.equal(m.tempWindow.high, high);
    }
  }
});

test('a route with no shared temperature at all is reported as such, not as a zero-width window', () => {
  const result = searchRoutes(entries, FRUCTOSE_P);
  const empty = result.routes
    .map((r) => routeMetrics(entries, r))
    .filter((m) => m.tempEmpty);
  assert.ok(empty.length > 0, 'this target has a route whose windows do not meet');
  for (const m of empty) {
    assert.equal(m.tempWindow, null);
    assert.ok(m.tempBlame.floor && m.tempBlame.ceiling);
  }
});

/* ------------------------------ the ranking ------------------------------- */

test('every criterion is a committed-field ordering, and ranking is a stable total order', () => {
  const result = searchRoutes(entries, makeTarget({ core: 'malate', groups: ['sulfate'], match: 'carries' }));
  for (const c of CRITERIA) {
    const once = rankRoutes(entries, result.routes, c.id).map((x) => x.route.id);
    const twice = rankRoutes(entries, [...result.routes].reverse(), c.id).map((x) => x.route.id);
    assert.deepEqual(once, twice, `ranking by ${c.id} depends on the order it was handed`);
    assert.equal(once.length, result.routes.length);
  }
});

test('ranking by fewest stages really does put a shorter route first', () => {
  const result = searchRoutes(entries, makeTarget({ core: 'malate', groups: ['sulfate'], match: 'carries' }));
  const ranked = rankRoutes(entries, result.routes, 'stages');
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(ranked[i - 1].metrics.stages <= ranked[i].metrics.stages);
  }
});

test('ranking by a window puts a route with no shared window last rather than first', () => {
  const result = searchRoutes(entries, FRUCTOSE_P);
  const ranked = rankRoutes(entries, result.routes, 'temp');
  const firstEmpty = ranked.findIndex((x) => x.metrics.tempEmpty);
  if (firstEmpty !== -1) {
    for (let i = firstEmpty; i < ranked.length; i += 1) {
      assert.equal(ranked[i].metrics.tempEmpty, true, 'a route with a shared window sorted after one without');
    }
  }
});

/* ------------------------------ determinism ------------------------------- */

test('the same target gives the same routes in the same order every time', () => {
  const a = searchRoutes(entries, FRUCTOSE_P);
  const b = searchRoutes(entries, FRUCTOSE_P);
  assert.deepEqual(a.routes.map((r) => r.id), b.routes.map((r) => r.id));
  assert.equal(a.totalFound, b.totalFound);
  assert.equal(a.shortestDepth, b.shortestDepth);
  assert.equal(searchHeadline(a), searchHeadline(b));
});

test('one starter scanned alone agrees with the same starter inside a whole search', () => {
  const whole = searchRoutes(entries, FRUCTOSE_P);
  const alone = scanFromStarter(entries, FRUCTOSE_P, 'glucose');
  const fromGlucose = whole.reachedFrom.find((r) => r.starterId === 'glucose');
  assert.ok(fromGlucose);
  assert.equal(alone.shortestDepth, fromGlucose.stages);
});

/* ------------------------------- the wording ------------------------------ */

test('the target description says what was asked for, in the catalogue\'s own words', () => {
  assert.match(describeTarget(FRUCTOSE_P), /Fructose/);
  assert.match(describeTarget(FRUCTOSE_P), /phosphate/);
  assert.match(describeTarget(FRUCTOSE_P), /3× hydroxyl/);
  // "carries" has to be visible in the wording, or a loose target reads as a
  // precise one.
  assert.match(describeTarget(makeTarget({ core: 'glucose', groups: ['phosphate'], match: 'carries' })), /possibly more/);
});

test('no headline this module can produce calls a route safe, viable, valid or designed', () => {
  const targets = [
    FRUCTOSE_P,
    makeTarget({ core: 'malate', groups: ['sulfate'], match: 'carries' }),
    makeTarget({ core: 'amide', groups: ['amine'], match: 'carries' }),
    makeTarget({ core: 'catechol', groups: ['methyl', 'sulfate'], match: 'carries' }),
  ];
  const banned = /\b(viable|valid|validated|approved|safe|stable|designed|optimal|best route|recommended|guaranteed|will work)\b/i;
  for (const t of targets) {
    const line = searchHeadline(searchRoutes(entries, t));
    assert.doesNotMatch(line, banned, `headline for ${describeTarget(t)} overclaims: ${line}`);
  }
  for (const c of CRITERIA) {
    assert.doesNotMatch(c.blurb, banned, `criterion ${c.id} overclaims`);
    assert.doesNotMatch(c.label, banned, `criterion ${c.id} label overclaims`);
  }
});
