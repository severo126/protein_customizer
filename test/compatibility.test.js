import test from 'node:test';
import assert from 'node:assert/strict';
import { byId } from './helpers.js';
import { checkTemperature, checkPh, checkCofactors, checkInhibition, intersectWindows, teamReport } from '../src/model/compatibility.js';
import { runPipeline } from '../src/model/pipeline.js';
import { starter } from '../src/model/molecules.js';

test('overlapping windows report their intersection', () => {
  const entries = [byId('hexokinase'), byId('glucokinase')];
  const t = checkTemperature(entries);
  assert.equal(t.colour, 'green');
  assert.match(t.message, /25–45 °C/);
  const p = checkPh(entries);
  assert.match(p.message, /pH 7–8\.2/);
});

test('an empty temperature intersection is a hard red that names both stages', () => {
  // DNA ligase tops out at 37 °C; glucose isomerase will not start below 45 °C.
  const t = checkTemperature([byId('dna-ligase'), byId('glucose-isomerase')]);
  assert.equal(t.colour, 'red');
  assert.match(t.message, /Glucose isomerase/);
  assert.match(t.message, /DNA ligase/);
  assert.match(t.message, /No shared temperature/);
});

test('an empty pH intersection is a hard red that names both stages', () => {
  const p = checkPh([byId('alkaline-phosphatase'), byId('invertase')]);
  assert.equal(p.colour, 'red');
  assert.match(p.message, /Alkaline phosphatase/);
  assert.match(p.message, /Invertase/);
});

test('a stage that eats a cofactor a later stage needs is a red', () => {
  // DNA ligase consumes ATP; hexokinase needs ATP afterwards.
  const c = checkCofactors([byId('dna-ligase'), byId('hexokinase')]);
  assert.equal(c.colour, 'red');
  assert.match(c.message, /ATP/);
  assert.match(c.message, /Hexokinase/);
});

test('cofactor order matters: the same two stages reversed are fine', () => {
  const c = checkCofactors([byId('hexokinase'), byId('dna-ligase')]);
  assert.equal(c.colour, 'green');
});

test('two stages that both eat and need the same cofactor clash whichever way round they go', () => {
  assert.equal(checkCofactors([byId('comt'), byId('gnmt')]).colour, 'red');
  assert.equal(checkCofactors([byId('gnmt'), byId('comt')]).colour, 'red');
});

test('cofactor families are matched, so malonyl-CoA counts against acyl-CoA', () => {
  const c = checkCofactors([byId('chalcone-synthase'), byId('gpat')]);
  assert.equal(c.colour, 'red');
  assert.match(c.message, /acyl-CoA/);
});

test('a later product that inhibits an earlier stage is flagged', () => {
  const entries = [byId('hexokinase'), byId('alkaline-phosphatase')];
  const i = checkInhibition(entries);
  assert.equal(i.colour, 'amber');
  assert.match(i.message, /phosphate/);
  assert.match(i.message, /Hexokinase/);
});

test('intersectWindows names which stage set the floor and which set the ceiling', () => {
  const w = intersectWindows([byId('dna-ligase'), byId('glucose-isomerase')], 'temp');
  assert.equal(w.empty, true);
  assert.equal(w.blame.floor.id, 'glucose-isomerase');
  assert.equal(w.blame.ceiling.id, 'dna-ligase');
});

test('the worst light decides the row verdict', () => {
  const entries = [byId('dna-ligase'), byId('glucose-isomerase')];
  const run = runPipeline(starter('triose'), entries);
  const report = teamReport(entries, run);
  assert.equal(report.worst, 'red');
  assert.equal(report.lights.length, 4);
});
