// The dial's own layer. Every number it shows comes from activity.js, so these
// tests check the mapping rather than the physics: that the stated window is the
// only line drawn, that heat and cold are not mirror images of each other, and
// that nothing here invents a threshold.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { root, byId } from './helpers.js';
import { climateFor, laneClimate, tempRange, bestTemp, climateLine, CLIMATE_NOTE } from '../src/ui/climate.js';
import { tempActivity, runLength, DEFAULT_RUN } from '../src/model/activity.js';

const entry = () => byId('hexokinase');

test('the dial reports the curve activity.js computes, not its own', () => {
  const e = entry();
  const { hours } = runLength(DEFAULT_RUN);
  for (const temp of [10, 25, 37, 45, 60]) {
    assert.equal(climateFor(e, temp, DEFAULT_RUN).activity, tempActivity(e, temp, hours));
  }
});

test('the only hard line is the entry’s own stated window', () => {
  const e = entry();
  const [lo, hi] = e.temp;
  assert.equal(climateFor(e, hi + 1, DEFAULT_RUN).over, true);
  assert.equal(climateFor(e, hi, DEFAULT_RUN).over, false);
  assert.equal(climateFor(e, lo - 1, DEFAULT_RUN).under, true);
  assert.equal(climateFor(e, lo, DEFAULT_RUN).under, false);
});

test('agitation is only ever above the stated window, never below it', () => {
  const e = entry();
  const [lo, hi] = e.temp;
  assert.equal(climateFor(e, lo - 30, DEFAULT_RUN).agitation, 0, 'cold must not shake anything');
  assert.equal(climateFor(e, (lo + hi) / 2, DEFAULT_RUN).agitation, 0);
  assert.equal(climateFor(e, hi, DEFAULT_RUN).agitation, 0);
  assert.ok(climateFor(e, hi + 2, DEFAULT_RUN).agitation > 0);
  assert.equal(climateFor(e, hi + 200, DEFAULT_RUN).agitation, 1, 'agitation is clamped');
});

test('warmth runs cold to hot across the window and is clamped at both ends', () => {
  const e = entry();
  const [lo, hi] = e.temp;
  assert.equal(climateFor(e, (lo + hi) / 2, DEFAULT_RUN).warmth, 0);
  assert.ok(climateFor(e, lo, DEFAULT_RUN).warmth < 0);
  assert.ok(climateFor(e, hi, DEFAULT_RUN).warmth > 0);
  assert.equal(climateFor(e, hi + 500, DEFAULT_RUN).warmth, 1);
  assert.equal(climateFor(e, 0, DEFAULT_RUN).warmth, -1);
});

test('the lane never stops dead however cold it is held', () => {
  const entries = [byId('hexokinase'), byId('gpat')];
  const cold = laneClimate(entries, 0, DEFAULT_RUN, entries[0]);
  assert.ok(cold.pace > 0, 'a frozen run would be a claim this app cannot make');
  assert.ok(cold.pace < 0.25, 'but it should be a crawl');
  assert.equal(cold.agitation, 0, 'cold claims no casualty');
});

test('heat and cold are not mirror images: only heat shakes the body', () => {
  const entries = [byId('hexokinase'), byId('gpat')];
  const hot = laneClimate(entries, Math.max(...entries.map((e) => e.temp[1])) + 15, DEFAULT_RUN, entries[0]);
  const cold = laneClimate(entries, Math.min(...entries.map((e) => e.temp[0])) - 15, DEFAULT_RUN, entries[0]);
  assert.ok(hot.agitation > 0);
  assert.equal(cold.agitation, 0);
  assert.ok(hot.warmth > 0 && cold.warmth < 0);
});

test('the dial range reaches past every window in the lane on both sides', () => {
  const entries = [byId('hexokinase'), byId('gpat')];
  const r = tempRange(entries);
  assert.ok(r.min < Math.min(...entries.map((e) => e.temp[0])));
  assert.ok(r.max > Math.max(...entries.map((e) => e.temp[1])));
  assert.ok(r.min >= 0);
});

test('the best point the button snaps to is the best the dial can reach', () => {
  const entries = [byId('hexokinase'), byId('gpat')];
  const at = bestTemp(entries, DEFAULT_RUN);
  const { min, max } = tempRange(entries);
  assert.ok(at >= min && at <= max);
  const here = laneClimate(entries, at, DEFAULT_RUN, entries[0]).laneActivity;
  for (const t of [min, at - 5, at + 5, max]) {
    assert.ok(laneClimate(entries, t, DEFAULT_RUN, entries[0]).laneActivity <= here + 1e-9, `${t} beat the best point`);
  }
});

test('a longer run moves the best point down, which is the whole teaching beat', () => {
  const entries = [byId('alpha-amylase')];
  const quick = bestTemp(entries, 'minutes');
  const overnight = bestTemp(entries, 'overnight');
  assert.ok(overnight < quick, `overnight (${overnight}) should sit below minutes (${quick})`);
});

test('the readout says where the dial is and what the curve says, and claims nothing else', () => {
  const e = entry();
  const stage = { entry: e };
  const hot = climateLine(stage, e.temp[1] + 10, DEFAULT_RUN);
  assert.match(hot, /past its stated window/);
  assert.match(hot, /% of its own best/);
  for (const word of ['denatur', 'destroy', 'dead', 'killed', 'unfold', 'broken']) {
    assert.ok(!new RegExp(word, 'i').test(hot), `the readout claims "${word}", which this toy cannot know`);
  }
});

test('the dial layer draws no threshold of its own', () => {
  // activity.js says no value of the curve means "good enough" and that no
  // threshold should be added. The view layer is where one would creep in.
  const src = readFileSync(`${root}/src/ui/climate.js`, 'utf8');
  assert.ok(!/threshold|cutoff|passes|too hot|too cold/i.test(src.replace(/^\s*\/\/.*$/gm, '')), 'a threshold appeared in the dial layer');
  assert.match(CLIMATE_NOTE, /not a stability prediction/);
  assert.match(CLIMATE_NOTE, /denaturation or aggregation/);
});
