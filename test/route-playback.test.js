// What the chosen route plays, and what it is not allowed to claim while
// playing it.
//
// The timeline is the one place in this app where a picture moves, which makes
// it the easiest place to imply something the catalogue does not say. These
// tests are mostly about what it must NOT do: no handoff that the two rules do
// not actually pair up, no stage that outruns or stops dead, no product coming
// out of a stage that refused, and no word anywhere that turns "held past its
// stated window" into damage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue, byId } from './helpers.js';
import { runPipeline } from '../src/model/pipeline.js';
import { starter } from '../src/model/molecules.js';
import { tempOptimum } from '../src/model/activity.js';
import {
  routeTimeline,
  laneTimeline,
  timelineHeadline,
  routeStory,
  stageChange,
  handoffBetween,
  STAGE_MS,
  SLOWEST_MULTIPLE,
  MAX_WOBBLE,
  PLAYBACK_NOTE,
} from '../src/ui/route-playback.js';
import { searchRoutes, makeTarget } from '../src/model/routes.js';

const entries = catalogue.entries;

// The route the home screen plays first: glucose phosphorylated and isomerised.
const TARGET = makeTarget({ core: 'fructose', groups: ['phosphate', 'hydroxyl', 'hydroxyl', 'hydroxyl'] });
const RESULT = searchRoutes(entries, TARGET);
const ROUTE = RESULT.routes[0];

test('the fixture route exists, so the rest of this file is testing something', () => {
  assert.ok(RESULT.reachable);
  assert.ok(ROUTE.stages.length >= 2, 'want a multi-stage route to test handoffs with');
});

/* ------------------------- what a stage says it does ---------------------- */

test('every catalogue rule produces a change read off the rule itself', () => {
  for (const e of entries) {
    const c = stageChange(e);
    assert.ok(['add', 'remove', 'join', 'rearrange'].includes(c.kind), `${e.id}: unknown kind`);
    assert.equal(typeof c.label, 'string');
    assert.ok(c.label.length > 0, `${e.id}: no label`);

    // A rearrange moves no group, and must not claim to.
    if (e.action.op === 'rearrange') {
      assert.deepEqual(c.moves, [], `${e.id}: a rearrange moved a group`);
      assert.deepEqual(c.frees, [], `${e.id}: a rearrange freed a group`);
    }
    // An add's group is the rule's group; a remove frees only what the rule
    // says it yields.
    if (e.action.op === 'add') assert.deepEqual(c.moves, [e.action.group]);
    if (e.action.op === 'remove') {
      assert.deepEqual(c.moves, [e.action.group]);
      assert.deepEqual(c.frees, e.action.yields ? [e.action.yields] : []);
    }
  }
});

test('a handoff is only claimed when one rule frees what the next rule needs', () => {
  let found = 0;
  for (const a of entries) {
    for (const b of entries) {
      const h = handoffBetween(a, b);
      if (!h) continue;
      found += 1;
      const out = stageChange(a);
      const next = stageChange(b);
      const available = [...out.frees, ...(out.kind === 'add' ? out.moves : [])];
      assert.ok(available.includes(h.group), `${a.id}→${b.id}: claimed a handoff of a group ${a.id} does not free`);
      assert.ok(next.needs.includes(h.group), `${a.id}→${b.id}: claimed a handoff of a group ${b.id} does not need`);
      assert.match(h.label, new RegExp(a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${a.id}→${b.id}: label names the wrong enzyme`);
    }
  }
  assert.ok(found > 0, 'no pair in the catalogue hands anything off — the detector is dead');
});

/* ----------------------------- pace and wobble ---------------------------- */

test('a stage never stops dead and never outruns the cap, at any temperature', () => {
  for (const temp of [5, 20, 37, 55, 75, 95]) {
    for (const runId of ['minutes', 'hours', 'overnight']) {
      const t = routeTimeline(entries, ROUTE, { temp, runId });
      for (const s of t.stages) {
        assert.ok(s.durationMs > 0, `${s.name} at ${temp}°C: zero duration`);
        assert.ok(Number.isFinite(s.durationMs), `${s.name} at ${temp}°C: duration is not a number`);
        assert.ok(s.durationMs >= STAGE_MS, `${s.name} at ${temp}°C: faster than full speed`);
        assert.ok(s.durationMs <= STAGE_MS * SLOWEST_MULTIPLE + 1, `${s.name} at ${temp}°C: slower than the cap`);
        assert.ok(s.wobble >= 0 && s.wobble <= MAX_WOBBLE + 1e-9, `${s.name} at ${temp}°C: wobble out of range`);
      }
      assert.equal(t.totalMs, t.stages.reduce((n, s) => n + s.durationMs, 0), 'total is not the sum of the stages');
    }
  }
});

test('the cold slows the chain, and every stage in it', () => {
  const cold = routeTimeline(entries, ROUTE, { temp: 5, runId: 'hours' });
  const warm = routeTimeline(entries, ROUTE, { temp: 37, runId: 'hours' });
  assert.ok(cold.totalMs > warm.totalMs, 'the cold run did not take longer');
  cold.stages.forEach((s, i) => {
    assert.ok(s.durationMs >= warm.stages[i].durationMs, `${s.name} did not slow in the cold`);
    assert.ok(s.underWindow, `${s.name} at 5 °C is not reported as under its window`);
    assert.equal(s.wobble, 0, 'the cold shook the picture — only heat past the window does that');
  });
});

test('held at its own optimum a single stage plays at full speed', () => {
  for (const id of ROUTE.stages) {
    const e = byId(id);
    // The dial moves in whole degrees, so the nearest degree to the curve's own
    // optimum is a hair off it. Full speed to within that rounding is the
    // honest claim; exact equality would be testing the rounding.
    const best = Math.round(tempOptimum(e, 'hours').temp);
    const t = routeTimeline(entries, { ...ROUTE, stages: [id], molecules: ROUTE.molecules.slice(0, 2) }, { temp: best, runId: 'hours' });
    const slack = t.stages[0].durationMs / STAGE_MS;
    assert.ok(slack < 1.01, `${e.name} at its own optimum (${best} °C) plays at ${slack.toFixed(3)}× full speed`);
    assert.equal(t.stages[0].pastWindow, false);
  }
});

test('past its stated window a stage is slow, shaken, and named', () => {
  const e = byId(ROUTE.stages[0]);
  const tooHot = e.temp[1] + Math.max(6, (e.temp[1] - e.temp[0]) / 2);
  const t = routeTimeline(entries, ROUTE, { temp: tooHot, runId: 'hours' });
  const hot = t.stages.find((s) => s.entryId === e.id);

  assert.ok(hot.pastWindow, 'not reported as past its window');
  assert.ok(hot.wobble > 0, 'past its window but the picture is steady');
  assert.deepEqual(hot.window, e.temp, 'the window shown is not the catalogue window');
  assert.ok(t.pastWindow.some((p) => p.id === e.id), 'the enzyme held too hot is not named on the timeline');
  assert.match(timelineHeadline(t), new RegExp(e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the headline does not name it');
  assert.match(hot.note, /past its stated window/);
});

test('the beats run in order and the last one ends the stage', () => {
  const t = routeTimeline(entries, ROUTE, { temp: 37, runId: 'hours' });
  for (const s of t.stages) {
    const b = s.beats;
    assert.ok(b.approach < b.dock, `${s.name}: dock before approach`);
    assert.ok(b.dock < b.transfer, `${s.name}: transfer before dock`);
    assert.ok(b.transfer < b.release, `${s.name}: release before transfer`);
    assert.ok(b.release < b.leave, `${s.name}: leave before release`);
    assert.equal(b.leave, s.durationMs, `${s.name}: the last beat is not the end of the stage`);
  }
});

/* ------------------- the picture cannot outrun the bench ------------------ */

test('the molecules on the timeline are the molecules the bench computed', () => {
  const t = routeTimeline(entries, ROUTE, { temp: 37, runId: 'hours' });
  t.stages.forEach((s, i) => {
    assert.deepEqual(s.molIn, ROUTE.molecules[i], `stage ${i}: wrong molecule going in`);
    assert.deepEqual(s.molOut, ROUTE.molecules[i + 1], `stage ${i}: wrong molecule coming out`);
  });
});

test('a lane that stalls puts the refusal in the timeline, in the rule’s own words', () => {
  // A lane built to refuse: a phosphate remover with nothing to remove.
  const run = runPipeline(starter('glucose'), [byId('alkaline-phosphatase'), byId('hexokinase')]);
  const stalled = run.stages.find((s) => s.state === 'mismatch');
  assert.ok(stalled, 'the fixture lane did not stall — pick another pair');

  const t = laneTimeline(entries, run, { temp: 37, runId: 'hours' });
  const i = t.refusedAt;
  assert.ok(i >= 0, 'the refusal is not marked on the timeline');
  assert.ok(t.stages[i].refused);
  assert.equal(t.stages[i].stallReason, stalled.stallReason, 'the timeline rewrote the rule’s own reason');
  assert.equal(t.stages[i].molOut, null, 'something came out of a stage that refused');
  assert.equal(t.stages[i].handoff, null, 'a stage that refused handed something on');
  // A refusal is still a stage: it has a duration and a pace like any other.
  assert.ok(t.stages[i].durationMs > 0);
  assert.ok(t.handoffs.every((h) => h.fromStage !== i), 'the refusal is still listed as handing off');

  const story = routeStory(t);
  assert.equal(story[i].after, null, 'the caption gave a refusal a product');
  assert.equal(story[i].stallReason, stalled.stallReason);
});

/* ------------------------------ what it may say --------------------------- */

test('nothing the timeline says claims damage, a verdict, or a rate', () => {
  const banned =
    /\b(denatur\w*|aggregat\w*|unfold\w*|destroy\w*|damag\w*|dead|killed|viable|valid|validated|approved|safe|stable|optimal|guaranteed|will work|yield of|turnover|k ?cat|per second)\b/i;

  // The disclaimer is the one sentence that is ALLOWED to contain these words,
  // because it is the sentence that denies them. It gets its own assertion
  // below rather than a hole in the regex.
  const said = [];
  for (const temp of [5, 37, 95]) {
    for (const runId of ['minutes', 'overnight']) {
      const t = routeTimeline(entries, ROUTE, { temp, runId });
      said.push(timelineHeadline(t));
      for (const s of t.stages) {
        said.push(s.note, s.change.label);
        if (s.handoff) said.push(s.handoff.label);
      }
      for (const s of routeStory(t)) said.push(s.change, s.handoff ?? '');
    }
  }
  for (const e of entries) said.push(stageChange(e).label);

  for (const line of said) {
    assert.doesNotMatch(line, banned, `the timeline overclaims: ${line}`);
  }

  // And the note shown beside it says, in so many words, that none of this is
  // a rate and nothing models falling apart.
  assert.match(PLAYBACK_NOTE, /not rates/);
  assert.match(PLAYBACK_NOTE, /not a prediction/);
  assert.match(PLAYBACK_NOTE, /nothing here models denaturation or aggregation/);
});

test('the headline names every enzyme held too hot, and agrees with itself about how many', () => {
  const one = routeTimeline(entries, ROUTE, { temp: 37, runId: 'hours' });
  if (!one.pastWindow.length) assert.match(timelineHeadline(one), /inside its stated window|under its stated window/);

  const hot = routeTimeline(entries, ROUTE, { temp: 95, runId: 'hours' });
  const line = timelineHeadline(hot);
  assert.ok(hot.pastWindow.length > 0, 'nothing is past its window at 95 °C');
  assert.match(line, hot.pastWindow.length > 1 ? /Held past their stated windows/ : /Held past its stated window/);
  for (const p of hot.pastWindow) {
    assert.match(line, new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${p.name} is held too hot but not named`);
  }
  // The run still finishes, and the line says why that is not a prediction.
  assert.match(line, /not something this toy can tell you/);
});
