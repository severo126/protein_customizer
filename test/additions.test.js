// The checks added from the protein-design literature survey.
//
// Every numeric assertion here is repeated byte-for-byte in py/tests/test_additions.py.
// That is the parity contract for these modules: the generated parity-cases.json
// covers splice, pipeline and the original lights, and these four modules are
// pinned by hand instead, so the fixture does not have to be regenerated to add
// a check.

import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue, byId, allStrings } from './helpers.js';
import {
  tempActivity,
  phActivity,
  bestPoint,
  tempOptimum,
  tempCurve,
  phCurve,
  compromiseNote,
  laneActivity,
  PH_EDGE_ACTIVITY,
  RUN_LENGTHS,
  ACTIVITY_DISCLAIMER,
} from '../src/model/activity.js';
import { ledger, checkLedger, regenerators, classifyCofactor, DONORS, METALS, PROSTHETIC } from '../src/model/ledger.js';
import { checkKinetics, checkDrive, kineticsLights, RATE_ORDER } from '../src/model/kinetics.js';
import { checkHost, filterByHost, supports, requirements, HOSTS, whyMissing } from '../src/model/hosts.js';
import { REMEDIES, remediesFor, shownRemedies, COVERED_LIGHTS } from '../src/model/remedies.js';
import { TOOL_MAP, toolNote, COVERED_CHECKS, STACK_NOTE, POT_NOTE } from '../src/model/toolMap.js';
import { teamReport } from '../src/model/compatibility.js';
import { FILTERS } from '../src/model/splice.js';

/* ---------------- the catalogue fields these modules read ---------------- */

test('every entry carries the four new labels, and says they are teaching-grade', () => {
  for (const e of catalogue.entries) {
    assert.ok(['fast', 'moderate', 'slow'].includes(e.rate), `${e.id}: rate`);
    assert.ok(['downhill', 'near-equilibrium', 'uphill'].includes(e.drive), `${e.id}: drive`);
    assert.ok(['monomer', 'homodimer', 'homotetramer', 'higher-order', 'heterodimer'].includes(e.assembly), `${e.id}: assembly`);
    assert.ok(Array.isArray(e.needs), `${e.id}: needs`);
    // docs/scope.md: anything invented for the toy has to say so in the data.
    assert.equal(e.source.labels, 'teaching-grade', `${e.id}: provenance`);
    assert.match(e.source.labels_note, /not measurements/, `${e.id}: provenance note`);
  }
});

test('needs carries only what a host supplies, never a cofactor already named', () => {
  const structural = new Set(['disulfide', 'secretion', 'glycosylation', 'membrane']);
  for (const e of catalogue.entries) {
    for (const n of e.needs) {
      assert.ok(structural.has(n), `${e.id}: unexpected needs token ${n}`);
    }
  }
});

/* ---------------------------- activity curves ---------------------------- */

test('a stated pH window edge reads as the edge activity, not as full activity', () => {
  const e = byId('hexokinase');
  assert.equal(phActivity(e, e.ph[0]).toFixed(6), PH_EDGE_ACTIVITY.toFixed(6));
  assert.equal(phActivity(e, e.ph[1]).toFixed(6), PH_EDGE_ACTIVITY.toFixed(6));
  // And the middle of the window is the best point.
  assert.equal(phActivity(e, (e.ph[0] + e.ph[1]) / 2).toFixed(6), '1.000000');
});

test('the temperature optimum moves down as the run gets longer', () => {
  const e = byId('alpha-amylase'); // stated window 30-75 °C
  const minutes = tempOptimum(e, 'minutes');
  const hours = tempOptimum(e, 'hours');
  const overnight = tempOptimum(e, 'overnight');

  assert.deepEqual([minutes.temp, minutes.value], [75, 0.884797]);
  assert.deepEqual([hours.temp, hours.value], [65.5, 0.424221]);
  assert.deepEqual([overnight.temp, overnight.value], [53, 0.229631]);

  // The point of the panel: both the temperature and the achievable rate fall.
  assert.ok(overnight.temp < hours.temp && hours.temp < minutes.temp);
  assert.ok(overnight.value < hours.value && hours.value < minutes.value);
});

test('a lane reports its best compromise point and how weak the weakest stage is there', () => {
  const lane = [byId('hexokinase'), byId('alkaline-phosphatase')];
  const best = bestPoint(lane, 'hours');
  assert.equal(best.temp, 42);
  assert.equal(best.ph, 7.95);
  assert.equal(best.value, 0.018168);
  assert.deepEqual(
    best.stages.map((s) => [s.id, s.value]),
    [['hexokinase', 0.2216], ['alkaline-phosphatase', 0.082]],
  );
  assert.equal(
    compromiseNote(lane, 'hours'),
    'Best shared point is 42 °C and pH 7.95 over a few hours, where the weakest stage, Alkaline phosphatase, runs at 8% of its own best.',
  );
});

test('an overlap is not the same as both stages being happy', () => {
  // These two share a temperature and pH band, so the existing lights are green.
  const lane = [byId('hexokinase'), byId('glucokinase')];
  const t = teamReport(lane);
  assert.equal(t.lights.find((l) => l.id === 'temp').colour, 'green');
  assert.equal(t.lights.find((l) => l.id === 'ph').colour, 'green');
  // The curves say the shared band is a long way from either enzyme's best.
  const best = bestPoint(lane, 'hours');
  assert.ok(best.value < 0.5, `expected a weak compromise, got ${best.value}`);
});

test('a lane with no shared window still gets a point reported, not a refusal', () => {
  // DNA ligase tops out at 37 °C and glucose isomerase will not start below 45.
  const lane = [byId('dna-ligase'), byId('glucose-isomerase')];
  assert.equal(teamReport(lane).lights.find((l) => l.id === 'temp').colour, 'red');
  assert.equal(
    compromiseNote(lane, 'hours'),
    'Best shared point is 35 °C and pH 7.85 over a few hours, where the weakest stage, Glucose isomerase, runs at 6% of its own best.',
  );
});

test('curves stay inside zero and one, over every entry and run length', () => {
  for (const e of catalogue.entries) {
    for (const r of RUN_LENGTHS) {
      for (const p of tempCurve(e, r.id, 12)) {
        assert.ok(p.value >= 0 && p.value <= 1, `${e.id} ${r.id} temp ${p.temp}: ${p.value}`);
      }
    }
    for (const p of phCurve(e, 12)) {
      assert.ok(p.value >= 0 && p.value <= 1, `${e.id} pH ${p.ph}: ${p.value}`);
    }
  }
});

test('an empty lane has no activity verdict to give', () => {
  assert.equal(bestPoint([], 'hours'), null);
  assert.equal(compromiseNote([], 'hours'), 'Add stages to see where they could all run at once.');
  assert.equal(laneActivity([], 40, 7, 3), 1);
});

test('peak height carries its disclaimer and no passing threshold exists', () => {
  assert.match(ACTIVITY_DISCLAIMER, /made-up number with made-up units/);
  assert.match(ACTIVITY_DISCLAIMER, /not a probability/);
  // docs/scope.md §3: no value of this number may mean "good enough".
  const source = allStrings({ ACTIVITY_DISCLAIMER }).map((s) => s.value).join(' ');
  assert.doesNotMatch(source, /good enough|passes|acceptable/i);
});

/* ------------------------------- the ledger ------------------------------- */

test('a cofactor is classified as spent, or as a condition of the pot', () => {
  for (const d of DONORS) assert.equal(classifyCofactor(d), 'donor', d);
  for (const m of METALS) assert.equal(classifyCofactor(m), 'metal', m);
  for (const p of PROSTHETIC) assert.equal(classifyCofactor(p), 'prosthetic', p);
  assert.equal(classifyCofactor('ADP'), 'acceptor');
  assert.equal(classifyCofactor('nothing-like-this'), 'unknown');
});

test('a lane that spends a donor is a net consumer, and the catalogue is searched for the fix', () => {
  const light = checkLedger([byId('hexokinase')], catalogue.entries);
  assert.equal(light.colour, 'amber');
  assert.equal(
    light.message,
    'This lane is a net consumer: 1× ATP spent with nothing putting it back. Pyruvate kinase runs on ADP and would hand ATP back.',
  );
  assert.deepEqual(light.suggestions, [
    { family: 'ATP', net: 1, partners: [{ id: 'pyruvate-kinase', name: 'Pyruvate kinase', takes: 'ADP' }] },
  ]);
});

test('adding the regeneration partner balances the books', () => {
  const light = checkLedger([byId('hexokinase'), byId('pyruvate-kinase')], catalogue.entries);
  assert.equal(light.colour, 'green');
  assert.equal(light.message, 'This lane puts back every donor it spends: 1× ATP out, 1 back.');
  assert.equal(light.ledger.balanced, true);
});

test('a metal or a prosthetic group is required present, not spent', () => {
  const light = checkLedger([byId('catalase'), byId('urease')], catalogue.entries);
  assert.equal(light.colour, 'green');
  assert.equal(
    light.message,
    'Nothing in this lane spends a group donor, so there is no pool to run down. It still needs Ni2+ and heme present throughout, which a pot either has or does not.',
  );
  assert.equal(light.ledger.donors.length, 0);
});

test('donors from one pool are counted together', () => {
  // Chalcone synthase runs on malonyl-CoA, GPAT on acyl-CoA: one pool.
  const book = ledger([byId('chalcone-synthase'), byId('gpat')]);
  assert.deepEqual(book.donors.map((d) => [d.family, d.spent]), [['acyl-CoA', 2]]);
});

test('an empty lane has nothing to total up', () => {
  const light = checkLedger([], catalogue.entries);
  assert.equal(light.colour, 'grey');
  assert.equal(light.ledger, null);
  assert.deepEqual(regenerators([], catalogue.entries), []);
});

/* --------------------------- rate and drive ------------------------------ */

test('a faster stage followed by a slower one piles up its intermediate', () => {
  const light = checkKinetics([byId('hexokinase'), byId('comt')]);
  assert.equal(light.colour, 'amber');
  assert.equal(
    light.message,
    'Stage 1 (Hexokinase) is moderate and stage 2 (Catechol O-methyltransferase) is slow, so phosphate piles up waiting to be cleared.',
  );
});

test('the pile-up turns red when it poisons the only stage that could clear it', () => {
  // Alkaline phosphatase frees phosphate fast; hexokinase is both the next stage
  // and listed as inhibited by phosphate. Neither field predicts this alone.
  const light = checkKinetics([byId('alkaline-phosphatase'), byId('hexokinase')]);
  assert.equal(light.colour, 'red');
  assert.equal(
    light.message,
    'Stage 1 (Alkaline phosphatase, fast) outruns stage 2 (Hexokinase, moderate), so phosphate builds up — and Hexokinase is itself listed as inhibited by phosphate, so the build-up slows down the only stage that could clear it.',
  );
  assert.equal(light.deadlock.group, 'phosphate');
});

test('a slow stage followed by a fast one is fine, so the check is order-sensitive', () => {
  assert.equal(checkKinetics([byId('endoglucanase'), byId('alpha-amylase')]).colour, 'green');
  assert.equal(checkKinetics([byId('alpha-amylase'), byId('endoglucanase')]).colour, 'red');
});

test('one stage cannot outrun anything', () => {
  const light = checkKinetics([byId('hexokinase')]);
  assert.equal(light.colour, 'grey');
  assert.match(light.message, /at least two stages/);
});

test('an uphill step with nothing after it has no reason to go forward', () => {
  const light = checkDrive([byId('aldolase')]);
  assert.equal(light.colour, 'amber');
  assert.equal(
    light.message,
    'Stage 1 (Fructose-bisphosphate aldolase) sits against its own equilibrium and nothing follows it to take the product away, so it has no reason to go forward. A faster enzyme would not help; a stage after it would.',
  );
});

test('a downstream stage pulling the product away is what makes an uphill step run', () => {
  const light = checkDrive([byId('aldolase'), byId('tim')]);
  assert.equal(light.colour, 'green');
  assert.equal(
    light.message,
    'Stage 1 (Fructose-bisphosphate aldolase) barely goes on its own, but stage 2 (Triose-phosphate isomerase) keeps taking the product away, and that is what makes it run.',
  );
});

test('a stage near equilibrium is called out as reversible rather than as a problem', () => {
  const light = checkDrive([byId('fumarase')]);
  assert.equal(light.colour, 'green');
  assert.match(light.message, /near equilibrium/);
  assert.match(light.message, /either direction/);
});

test('both new lights come back in a fixed order', () => {
  assert.deepEqual(kineticsLights([byId('hexokinase'), byId('comt')]).map((l) => l.id), ['kinetics', 'drive']);
  assert.deepEqual(RATE_ORDER, { slow: 0, moderate: 1, fast: 2 });
});

/* -------------------------------- hosts ---------------------------------- */

test('a host that cannot supply a prosthetic group blocks the stage before any chemistry', () => {
  const light = checkHost('ecoli-cytoplasm', [byId('catalase')]);
  assert.equal(light.colour, 'red');
  assert.equal(
    light.message,
    'Stage 1 is the problem before any chemistry starts: Catalase needs a heme group, and E. coli cytoplasm cannot provide that.',
  );
  assert.equal(checkHost('yeast', [byId('catalase')]).colour, 'green');
});

test('two missing requirements read as a sentence', () => {
  assert.equal(
    checkHost('ecoli-cytoplasm', [byId('lipase')]).message,
    'Stage 1 is the problem before any chemistry starts: Triacylglycerol lipase needs disulfide bonds and a secretory pathway, and E. coli cytoplasm cannot provide those.',
  );
  assert.equal(checkHost('ecoli-periplasm', [byId('lipase')]).colour, 'green');
});

test('requirements come from the needs field and from the cofactor string', () => {
  assert.deepEqual(requirements(byId('catalase')), [{ token: 'heme', kind: 'prosthetic' }]);
  assert.deepEqual(requirements(byId('lipase')), [
    { token: 'disulfide', kind: 'structural' },
    { token: 'secretion', kind: 'structural' },
  ]);
  assert.deepEqual(requirements(byId('hexokinase')), []);
});

test('the funnel splits the fixed catalogue per host and never shortens it', () => {
  for (const h of HOSTS) {
    const f = filterByHost(h.id, catalogue.entries);
    assert.equal(f.available.length + f.blocked.length, catalogue.entries.length, h.id);
    for (const b of f.blocked) assert.match(b.reason, /cannot provide/, `${h.id}/${b.entry.id}`);
  }
  assert.equal(filterByHost('ecoli-cytoplasm', catalogue.entries).blocked.length, 13);
  assert.equal(filterByHost('yeast', catalogue.entries).blocked.length, 0);
});

test('every blocked requirement can explain itself', () => {
  const f = filterByHost('ecoli-cytoplasm', catalogue.entries);
  for (const b of f.blocked) {
    for (const w of whyMissing(b.missing)) {
      assert.ok(w.why, `${b.entry.id}: no explanation for ${w.token}`);
    }
  }
});

test('an unknown host is a programming error, not a silent pass', () => {
  assert.throws(() => supports('not-a-host', byId('lipase')), /unknown host/);
});

/* ---------------------- remedies and the tool map ------------------------ */

test('every light the model can produce has a remedy with a cost', () => {
  const produced = new Set([
    ...teamReport([byId('hexokinase')]).lights.map((l) => l.id),
    ...kineticsLights([byId('hexokinase'), byId('comt')]).map((l) => l.id),
    checkLedger([byId('hexokinase')], catalogue.entries).id,
    checkHost('ecoli-cytoplasm', [byId('catalase')]).id,
  ]);
  for (const id of produced) {
    const r = remediesFor(id);
    assert.ok(r, `no remedies for light "${id}"`);
    assert.ok(r.options.length >= 2, `${id}: needs at least two ways out`);
    for (const o of r.options) {
      assert.ok(o.cost && o.cost.length > 10, `${id}/${o.id}: every remedy states its cost`);
    }
  }
});

test('a dead window is restated as "not a one-pot" rather than as impossible', () => {
  for (const id of ['temp', 'ph']) {
    assert.equal(REMEDIES[id].headline, 'Not a one-pot');
    assert.match(REMEDIES[id].restatement, /does not rule out|is not/i);
  }
});

test('the app separates what it can show from what takes a laboratory', () => {
  for (const id of COVERED_LIGHTS) {
    const shown = shownRemedies(id);
    assert.ok(shown.length >= 1, `${id}: at least one remedy the app can demonstrate`);
    assert.ok(shown.length <= REMEDIES[id].options.length);
  }
  // Engineering an enzyme is described, never offered as something to try here.
  assert.equal(REMEDIES.temp.options.find((o) => o.id === 'engineer').shown, false);
});

test('every filter and every light says what a real workflow would use', () => {
  for (const f of FILTERS) {
    const note = toolNote(f.id);
    assert.ok(note, `no tool note for filter "${f.id}"`);
    assert.ok(note.real && note.breaks, `${f.id}: needs both the method and its limit`);
  }
  for (const id of COVERED_LIGHTS) {
    assert.ok(toolNote(id), `no tool note for light "${id}"`);
  }
});

test('the caveat says plainly that none of the real tools predicts activity', () => {
  assert.match(STACK_NOTE, /None of them tells you whether a construct would still catalyse/);
  assert.match(POT_NOTE, /one protein at a time/);
  for (const id of COVERED_CHECKS) {
    assert.ok(TOOL_MAP[id].question.endsWith('?'), `${id}: the question should read as one`);
  }
});
