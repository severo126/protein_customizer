import test from 'node:test';
import assert from 'node:assert/strict';
import { byId, catalogue } from './helpers.js';
import { starter, hasGroups, STARTERS } from '../src/model/molecules.js';
import { runStage, runPipeline } from '../src/model/pipeline.js';

test('a kinase adds a phosphate to a molecule with a free hydroxyl', () => {
  const r = runStage(starter('glucose'), byId('hexokinase'));
  assert.equal(r.ok, true);
  assert.ok(hasGroups(r.product, ['phosphate']));
  assert.equal(r.product.groups.filter((g) => g === 'hydroxyl').length, 3);
});

test('a stage that has no rule for its input reports a mismatch instead of passing it along', () => {
  const r = runStage(starter('peroxide'), byId('hexokinase'));
  assert.equal(r.ok, false);
  assert.equal(r.product, null);
  assert.match(r.stallReason, /Hexokinase/);
  assert.match(r.stallReason, /hydroxyl/);
});

test('a phosphatase undoes a kinase', () => {
  const run = runPipeline(starter('glucose'), [byId('hexokinase'), byId('alkaline-phosphatase')]);
  assert.equal(run.stalled, false);
  assert.deepEqual(run.product.groups.filter((g) => g === 'phosphate'), []);
});

test('an isomerase only accepts the skeleton it knows', () => {
  const ok = runPipeline(starter('glucose'), [byId('glucose-isomerase')]);
  assert.equal(ok.stalled, false);
  assert.equal(ok.product.core, 'fructose');

  const bad = runPipeline(starter('glycerol'), [byId('glucose-isomerase')]);
  assert.equal(bad.stalled, true);
  assert.match(bad.stages[0].stallReason, /only rearranges a Glucose skeleton/);
});

test('a stall stops the lane and marks the later stages unreached', () => {
  const run = runPipeline(starter('glycerol'), [byId('glucose-isomerase'), byId('hexokinase')]);
  assert.equal(run.stalled, true);
  assert.equal(run.stalledAt, 0);
  assert.equal(run.stages[1].state, 'unreached');
  assert.equal(run.product, null);
});

test('every stall carries a why-did-this-stall explanation', () => {
  for (const s of STARTERS) {
    for (const entry of catalogue.entries) {
      const run = runPipeline(starter(s.id), [entry]);
      if (run.stalled) {
        assert.ok(run.stages[0].stallReason && run.stages[0].stallReason.length > 20, `${s.id} + ${entry.id} stalled with no explanation`);
      } else {
        assert.ok(run.product, `${s.id} + ${entry.id} ran but produced nothing`);
      }
    }
  }
});

test('the score is labelled as made up and a stalled lane cannot score full marks', () => {
  const good = runPipeline(starter('glucose'), [byId('hexokinase')]);
  const stalled = runPipeline(starter('peroxide'), [byId('hexokinase')]);
  assert.match(good.scoreDisclaimer, /made-up/);
  assert.ok(stalled.score.value < good.score.value);
  assert.equal(stalled.score.value, 0);
});

test('every catalogue entry can be reached by at least one starting molecule', () => {
  for (const entry of catalogue.entries) {
    const runnable = STARTERS.some((s) => runStage(starter(s.id), entry).ok);
    assert.ok(runnable, `${entry.id} has no starting molecule it will accept`);
  }
});
