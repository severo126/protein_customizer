// The "what fits next" filter: the catalogue sorted against the lane that is
// already on the bench. Same cartoon checks as the traffic lights, so these
// tests also pin the claim the filter is allowed to make.

import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue, byId } from './helpers.js';
import { suggestNext, FIT_NOTE } from '../src/model/suggest.js';
import { starter } from '../src/model/molecules.js';
import { runPipeline } from '../src/model/pipeline.js';

const all = catalogue.entries;

test('every entry lands in exactly one bucket, and the buckets cover the catalogue', () => {
  const s = suggestNext(all, [byId('hexokinase')], starter('glucose'));
  assert.equal(s.items.length, all.length);
  assert.equal(s.counts.fits + s.counts.caution + s.counts.blocked, all.length);
  for (const item of s.items) {
    assert.ok(['fits', 'caution', 'blocked'].includes(item.verdict));
  }
});

test('with an empty lane nothing is blocked by a window or a cofactor', () => {
  const s = suggestNext(all, [], starter('glucose'));
  assert.ok(s.context.empty);
  for (const item of s.items) {
    for (const r of item.reasons) {
      assert.ok(['substrate'].includes(r.kind), `an empty lane should only check the substrate, got ${r.kind}`);
    }
  }
  // Glucose carries hydroxyls, so a kinase fits and a decarboxylase does not.
  assert.equal(s.items.find((i) => i.entry.id === 'hexokinase').verdict, 'fits');
  assert.equal(s.items.find((i) => i.entry.id === 'pyruvate-decarboxylase').verdict, 'blocked');
});

test('a stage with no rule for the running product is blocked, and says why', () => {
  const lane = [byId('hexokinase')];
  const run = runPipeline(starter('glucose'), lane);
  const s = suggestNext(all, lane, run.product);
  const item = s.items.find((i) => i.entry.id === 'pyruvate-kinase');
  assert.equal(item.verdict, 'blocked');
  const why = item.reasons.find((r) => r.kind === 'substrate');
  assert.equal(why.level, 'blocked');
  assert.match(why.text, /Pyruvate kinase/);
  assert.match(why.text, /carboxyl/);
});

test('an entry whose window cannot meet the lane is blocked, naming both sides', () => {
  // DNA ligase tops out at 37 °C; glucose isomerase will not start below 45 °C.
  const s = suggestNext(all, [byId('dna-ligase')], starter('glucose'));
  const item = s.items.find((i) => i.entry.id === 'glucose-isomerase');
  assert.equal(item.verdict, 'blocked');
  const why = item.reasons.find((r) => r.kind === 'temp');
  assert.equal(why.level, 'blocked');
  assert.match(why.text, /no shared temperature/i);
  assert.match(why.text, /Glucose isomerase/);
  assert.match(why.text, /DNA ligase/);
});

test('an entry whose cofactor an earlier stage eats is blocked, naming the eater', () => {
  // DNA ligase consumes ATP, which hexokinase needs.
  const s = suggestNext(all, [byId('dna-ligase')], starter('glucose'));
  const item = s.items.find((i) => i.entry.id === 'hexokinase');
  assert.equal(item.verdict, 'blocked');
  const why = item.reasons.find((r) => r.kind === 'cofactor');
  assert.match(why.text, /DNA ligase/);
  assert.match(why.text, /ATP/);
});

test('cofactor pools are aliased the way the traffic lights alias them', () => {
  // Chalcone synthase consumes acyl-CoA; citrate synthase needs acetyl-CoA,
  // which is the same pool.
  const s = suggestNext(all, [byId('chalcone-synthase')], starter('pyruvate'));
  const item = s.items.find((i) => i.entry.id === 'citrate-synthase');
  const why = item.reasons.find((r) => r.kind === 'cofactor');
  assert.ok(why, 'acetyl-CoA and acyl-CoA should count as one pool');
  assert.equal(item.verdict, 'blocked');
});

test('product inhibition is a caution, not a block', () => {
  // Hexokinase is listed as inhibited by free phosphate; a phosphatase later
  // in the lane frees some.
  const lane = [byId('hexokinase')];
  const run = runPipeline(starter('glucose'), lane);
  const s = suggestNext(all, lane, run.product);
  const item = s.items.find((i) => i.entry.id === 'alkaline-phosphatase');
  assert.equal(item.verdict, 'caution');
  const why = item.reasons.find((r) => r.kind === 'inhibition');
  assert.match(why.text, /phosphate/);
  assert.match(why.text, /Hexokinase/);
});

test('a thin shared window is a caution rather than a pass', () => {
  const s = suggestNext(all, [byId('gnmt')], starter('glycine'));
  const thin = s.items.filter((i) => i.reasons.some((r) => r.level === 'caution' && (r.kind === 'temp' || r.kind === 'ph')));
  assert.ok(thin.length > 0, 'some pairing should narrow a window without closing it');
  for (const item of thin) assert.notEqual(item.verdict, 'fits');
});

test('a stalled lane checks nothing and says so rather than guessing', () => {
  const lane = [byId('glucose-isomerase'), byId('hexokinase')];
  const run = runPipeline(starter('glycerol'), lane);
  assert.ok(run.stalled);
  const s = suggestNext(all, lane, run.product);
  assert.ok(s.context.stalled);
  for (const item of s.items) {
    const why = item.reasons.find((r) => r.kind === 'substrate');
    if (why) assert.match(why.text, /no product to hand it/);
  }
});

test('a lane with no shared window at all stops blaming new entries for it', () => {
  const lane = [byId('dna-ligase'), byId('glucose-isomerase')];
  const s = suggestNext(all, lane, starter('glucose'));
  assert.ok(s.context.potAlreadyClosed);
  for (const item of s.items) {
    assert.ok(!item.reasons.some((r) => r.kind === 'temp' || r.kind === 'ph'));
  }
});

test('the filter never claims more than the absence of a red flag', () => {
  assert.match(FIT_NOTE, /not a prediction/i);
  for (const word of ['validated', 'approved', 'verified', 'safe', 'viable', 'stable']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(FIT_NOTE), `the fit note must not say "${word}"`);
  }
  const s = suggestNext(all, [byId('hexokinase')], starter('glucose'));
  for (const item of s.items) {
    for (const r of item.reasons) {
      assert.ok(!/\b(validated|approved|verified|guaranteed)\b/i.test(r.text), `reason claims too much: ${r.text}`);
    }
  }
});
