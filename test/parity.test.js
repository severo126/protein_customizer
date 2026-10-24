// The JavaScript half of the parity contract.
//
// src/data/parity-cases.json is the agreed answer sheet for both
// implementations. py/tests/test_parity.py asserts exactly the same file. If
// one side drifts, one suite goes red and names the case.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { root, byId } from './helpers.js';
import { runFilters } from '../src/model/splice.js';
import { runPipeline } from '../src/model/pipeline.js';
import { teamReport } from '../src/model/compatibility.js';
import { starter } from '../src/model/molecules.js';

const cases = JSON.parse(readFileSync(`${root}/src/data/parity-cases.json`, 'utf8'));
const round = (n) => Number(n.toFixed(4));
const site = (entry, id) => entry.domain.sites.find((s) => s.id === id);

test('the parity file is big enough to be worth having', () => {
  assert.ok(cases.splice.length >= 200, 'too few splice cases to catch drift');
  assert.ok(cases.pipeline.length >= 10);
  assert.ok(cases.stages.length >= 50);
});

test('every splice case matches, verdict and wording', () => {
  for (const c of cases.splice) {
    const a = byId(c.a);
    const b = byId(c.b);
    const v = runFilters(a, site(a, c.site_a), b, site(b, c.site_b), c.linker, c.team.map(byId));
    const where = `${c.a}:${c.site_a} + ${c.b}:${c.site_b} @${c.linker}`;

    assert.equal(v.killedBy, c.expect.killed_by, `${where}: killed-by`);
    assert.equal(v.passed, c.expect.passed, `${where}: passed`);
    assert.equal(round(v.geometry.joinDistance), c.expect.join_distance, `${where}: join distance`);
    assert.equal(round(v.geometry.centreDistance), c.expect.centre_distance, `${where}: centre distance`);
    assert.equal(round(v.rg), c.expect.rg, `${where}: radius of gyration`);
    assert.deepEqual([round(v.rgBand.low), round(v.rgBand.high)], c.expect.rg_band, `${where}: Rg band`);

    assert.equal(v.results.length, c.expect.results.length, `${where}: filter count`);
    v.results.forEach((r, i) => {
      assert.equal(r.id, c.expect.results[i].id, `${where}: filter ${i} id`);
      assert.equal(r.pass, c.expect.results[i].pass, `${where}: filter ${r.id} verdict`);
      assert.equal(r.reason, c.expect.results[i].reason, `${where}: filter ${r.id} reason`);
    });
  }
});

test('every lane case matches, including the traffic lights', () => {
  for (const c of cases.pipeline) {
    const lane = c.lane.map(byId);
    const run = runPipeline(starter(c.start), lane);
    const team = teamReport(lane, run);
    const where = `${c.start} → ${c.lane.join(' → ')}`;

    assert.equal(run.stalled, c.expect.stalled, `${where}: stalled`);
    assert.equal(run.stalledAt, c.expect.stalled_at, `${where}: stalled at`);
    assert.deepEqual(run.stages.map((s) => s.state), c.expect.states, `${where}: stage states`);
    assert.deepEqual(run.stages.map((s) => s.stallReason ?? null), c.expect.stall_reasons, `${where}: stall reasons`);
    assert.deepEqual(
      run.product ? { core: run.product.core, groups: run.product.groups } : null,
      c.expect.product,
      `${where}: product`,
    );
    assert.equal(run.productDescription, c.expect.product_description, `${where}: product description`);
    assert.equal(run.score.value, c.expect.score, `${where}: score`);
    assert.equal(run.score.basis, c.expect.score_basis, `${where}: score basis`);
    assert.deepEqual(
      team.lights.map((l) => ({ id: l.id, colour: l.colour, message: l.message })),
      c.expect.lights,
      `${where}: traffic lights`,
    );
    assert.equal(team.worst, c.expect.worst, `${where}: worst light`);
  }
});

test('every single-stage case matches, including the mismatch wording', () => {
  for (const c of cases.stages) {
    const run = runPipeline(starter(c.start), [byId(c.enzyme)]);
    const where = `${c.start} + ${c.enzyme}`;
    assert.equal(run.stalled, c.expect.stalled, `${where}: stalled`);
    assert.equal(run.stages[0].stallReason ?? null, c.expect.reason, `${where}: stall reason`);
    assert.equal(run.stages[0].what ?? null, c.expect.what, `${where}: what it did`);
    assert.deepEqual(
      run.product ? { core: run.product.core, groups: run.product.groups } : null,
      c.expect.product,
      `${where}: product`,
    );
  }
});
