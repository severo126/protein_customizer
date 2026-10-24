// The seeded demo is asserted, so it cannot rot into a route that no longer
// teaches what the caption says it teaches.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { root, byId } from './helpers.js';
import { runPipeline } from '../src/model/pipeline.js';
import { teamReport } from '../src/model/compatibility.js';
import { starter } from '../src/model/molecules.js';
import { runFilters } from '../src/model/splice.js';

const demo = JSON.parse(readFileSync(`${root}/src/data/demo.json`, 'utf8'));

test('the demo offers one clean run and two different failures', () => {
  const kinds = demo.routes.map((r) => r.expect);
  assert.deepEqual([...new Set(kinds)].sort(), ['runs', 'runs-but-red', 'stalls']);
});

test('each demo route does what its caption claims', () => {
  for (const route of demo.routes) {
    const lane = route.lane.map(byId);
    const run = runPipeline(starter(route.starter), lane);
    const team = teamReport(lane, run);

    if (route.expect === 'runs') {
      assert.equal(run.stalled, false, `${route.id} should run`);
      assert.equal(team.worst, 'green', `${route.id} should be all green`);
      assert.ok(run.product);
    }
    if (route.expect === 'stalls') {
      assert.equal(run.stalled, true, `${route.id} should stall`);
      assert.ok(run.stages[run.stalledAt].stallReason.length > 20, `${route.id} needs a real explanation`);
    }
    if (route.expect === 'runs-but-red') {
      assert.equal(run.stalled, false, `${route.id} should still run`);
      assert.equal(team.worst, 'red', `${route.id} should be a hard red`);
      const red = team.lights.find((l) => l.colour === 'red');
      // An empty intersection must name both stages that caused it.
      for (const e of lane) assert.ok(red.message.includes(e.name) || team.lights.some((l) => l.message.includes(e.name)));
    }
  }
});

test('the demo splice pair clears every filter, and its neighbours do not', () => {
  const a = byId(demo.splice.a);
  const b = byId(demo.splice.b);
  const siteA = a.domain.sites.find((s) => s.id === demo.splice.site_a);
  const siteB = b.domain.sites.find((s) => s.id === demo.splice.site_b);

  assert.equal(runFilters(a, siteA, b, siteB, demo.splice.linker).passed, true, 'the seeded pair should pass');
  assert.equal(runFilters(a, siteA, b, siteB, 2).killedBy, 'clash', 'the caption promises a clash at 2 units');
  assert.equal(runFilters(a, siteA, b, siteB, 20).killedBy, 'compactness', 'the caption promises a compactness reject at 20');
});
