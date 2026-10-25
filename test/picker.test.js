import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue } from './helpers.js';
import {
  screenPickerText,
  parseTargetLocally,
  normalisePickerReply,
  pickerOptions,
  askPrompt,
  targetSummary,
  coreLabel,
  MAX_MODEL_SENTENCE,
  PICKER_NOTE,
} from '../src/model/picker.js';
import { targetVocabulary, searchRoutes, matchesTarget, describeTarget } from '../src/model/routes.js';
import { starter } from '../src/model/molecules.js';
import { runPipeline } from '../src/model/pipeline.js';

const entries = catalogue.entries;

/* ---------------------------------------------------------------------------
 * The guard that matters. The picker is the one surface where text the repo
 * did not write reaches the screen, and the specific failure to prevent is the
 * model answering the question the route search is for. A sentence naming an
 * enzyme has invented a step even when it happens to name the right one,
 * because nothing checked it.
 * ------------------------------------------------------------------------- */

test('a model sentence naming any catalogue enzyme is blocked, by name and by id', () => {
  for (const e of entries) {
    const byName = screenPickerText(`You will want ${e.name} for that.`, entries);
    assert.equal(byName.ok, false, `${e.name} got through by name`);
    assert.match(byName.reason, /search/);

    const byId = screenPickerText(`Use ${e.id} here.`, entries);
    assert.equal(byId.ok, false, `${e.id} got through by id`);
  }
});

test('a model sentence giving a verdict is blocked', () => {
  for (const line of [
    'This construct would be stable.',
    'That route is viable.',
    'This is the optimal choice.',
    'It is safe to run.',
    'That approach is validated.',
    'This should work.',
    'The yield would be high.',
  ]) {
    const r = screenPickerText(line, entries);
    assert.equal(r.ok, false, `let a verdict through: ${line}`);
  }
});

test('a model sentence claiming something outside what the toy checks is blocked', () => {
  for (const line of [
    'This would work in vivo.',
    'Useful for a therapeutic.',
    'The dose would be small.',
    'That is toxic.',
  ]) {
    assert.equal(screenPickerText(line, entries).ok, false, `let overreach through: ${line}`);
  }
});

test('a model sentence containing anything shaped like a sequence is blocked', () => {
  assert.equal(screenPickerText('Try MKVLAAGIVGLSTA for this.', entries).ok, false);
  assert.equal(screenPickerText('Use ATGGCATTACGGATCC as the insert.', entries).ok, false);
});

test('a plain restatement of what the user asked for is allowed through', () => {
  for (const line of [
    'Got it, a fructose carrying a phosphate.',
    'So you want a sugar put on, then trimmed back off.',
    'A malate with a sulfate on it.',
  ]) {
    const r = screenPickerText(line, entries);
    assert.equal(r.ok, true, `blocked a harmless restatement: ${line} (${r.reason})`);
  }
});

test('an over-long model sentence is blocked rather than truncated', () => {
  const long = `A ${'very '.repeat(80)}long restatement.`;
  assert.ok(long.length > MAX_MODEL_SENTENCE);
  const r = screenPickerText(long, entries);
  assert.equal(r.ok, false);
  assert.match(r.reason, new RegExp(String(MAX_MODEL_SENTENCE)));
});

/* ----------------------- reading the model's structure -------------------- */

test('a target naming a skeleton outside the catalogue is rejected, with the reachable ones listed', () => {
  const r = normalisePickerReply({ kind: 'target', core: 'unobtainium', groups: ['phosphate'] }, entries);
  assert.equal(r.kind, 'rejected');
  assert.ok(r.problems.some((p) => /Reachable skeletons/.test(p)));
});

test('a target naming a group no catalogue rule produces is rejected', () => {
  const r = normalisePickerReply({ kind: 'target', core: 'glucose', groups: ['plutonium'] }, entries);
  assert.equal(r.kind, 'rejected');
});

test('a question whose options are not in the catalogue is rejected rather than shown', () => {
  const r = normalisePickerReply({ kind: 'ask', choose: 'core', options: ['kryptonite', 'unobtainium'] }, entries);
  assert.equal(r.kind, 'rejected');
  assert.ok(r.problems.some((p) => /nothing from this catalogue/.test(p)));
});

test('a question keeps only the options that are in the catalogue', () => {
  const r = normalisePickerReply({ kind: 'ask', choose: 'core', options: ['glucose', 'kryptonite', 'malate'] }, entries);
  assert.equal(r.kind, 'ask');
  assert.deepEqual(r.options, ['glucose', 'malate']);
});

test('a question that names an enzyme loses its wording but keeps its options', () => {
  const r = normalisePickerReply(
    { kind: 'ask', choose: 'groups', options: ['phosphate', 'sulfate'], question: 'Hexokinase or not?' },
    entries,
  );
  assert.equal(r.kind, 'ask');
  assert.equal(r.question, null, 'the screened sentence should be dropped');
  // And the app can still ask the question itself.
  assert.match(askPrompt(r.choose, r.options), /phosphate/);
});

test('a reply of an unknown kind is rejected by name', () => {
  const r = normalisePickerReply({ kind: 'freestyle' }, entries);
  assert.equal(r.kind, 'rejected');
  assert.ok(r.problems.some((p) => /freestyle/.test(p)));
});

test('a reply that is not an object at all is rejected', () => {
  for (const bad of [null, 'a string', 42, undefined]) {
    assert.equal(normalisePickerReply(bad, entries).kind, 'rejected');
  }
});

test('a model target that passes validation really is searchable, and its routes run', () => {
  const r = normalisePickerReply({ kind: 'target', core: 'fructose', groups: ['phosphate'], match: 'carries' }, entries);
  assert.equal(r.kind, 'target');
  const result = searchRoutes(entries, r.target);
  assert.equal(result.reachable, true);
  for (const route of result.routes) {
    const run = runPipeline(starter(route.starterId), route.stages.map((id) => entries.find((e) => e.id === id)));
    assert.equal(run.stalled, false);
    assert.ok(matchesTarget(run.product, r.target));
  }
});

/* ------------------------- the keyless keyword parser --------------------- */

test('the keyword parser works with no model and finds the obvious targets', () => {
  const cases = [
    ['put a phosphate on glucose', 'glucose', ['phosphate']],
    ['I want fructose carrying a phosphate', 'fructose', ['phosphate']],
    ['two phosphates on glycerol', 'glycerol', ['phosphate', 'phosphate']],
    ['malate with a sulfate', 'malate', ['sulfate']],
  ];
  for (const [sentence, core, groups] of cases) {
    const p = parseTargetLocally(sentence, entries);
    assert.equal(p.complete, true, `could not parse: ${sentence}`);
    assert.equal(p.target.core, core, sentence);
    assert.deepEqual([...p.target.groups].sort(), [...groups].sort(), sentence);
    assert.equal(p.source, 'keyword');
  }
});

test('the skeleton\'s own name is not also counted as a group to hang on', () => {
  // "glucose-1-phosphate" names a skeleton that happens to contain the word
  // phosphate. Asking for a phosphate on top of it is not what was typed.
  const p = parseTargetLocally('glucose-1-phosphate', entries);
  assert.equal(p.target.core, 'glucose-1-p');
  assert.deepEqual(p.target.groups, []);
});

test('a sentence naming no skeleton is reported as incomplete rather than guessed at', () => {
  const p = parseTargetLocally('something interesting please', entries);
  assert.equal(p.complete, false);
  assert.equal(p.target, null);
  assert.equal(p.matched.core, null);
});

test('"exactly" and "nothing else" are the only way to get a strict match', () => {
  assert.equal(parseTargetLocally('glucose with a phosphate', entries).target.match, 'carries');
  assert.equal(parseTargetLocally('exactly glucose with a phosphate', entries).target.match, 'exact');
  assert.equal(parseTargetLocally('glucose with a phosphate and nothing else', entries).target.match, 'exact');
});

test('everything the keyword parser can produce is a target the search accepts', () => {
  const vocab = targetVocabulary(entries);
  for (const core of vocab.cores) {
    for (const g of vocab.groups) {
      const p = parseTargetLocally(`${coreLabel(core)} with a ${g}`, entries);
      if (!p.complete) continue;
      assert.ok(vocab.cores.includes(p.target.core), `${p.target.core} is outside the vocabulary`);
      for (const got of p.target.groups) {
        assert.ok(vocab.groups.includes(got), `${got} is outside the vocabulary`);
      }
    }
  }
});

/* ------------------------------ what it offers ---------------------------- */

test('the chips offer exactly the catalogue vocabulary, starting molecules first', () => {
  const opts = pickerOptions(entries);
  const vocab = targetVocabulary(entries);
  assert.deepEqual([...opts.cores.map((c) => c.id)].sort(), [...vocab.cores].sort());
  assert.deepEqual([...opts.groups.map((g) => g.id)].sort(), [...vocab.groups].sort());

  const firstMade = opts.cores.findIndex((c) => !c.isStarter);
  if (firstMade !== -1) {
    for (let i = firstMade; i < opts.cores.length; i += 1) {
      assert.equal(opts.cores[i].isStarter, false, 'a starting molecule sorted after one that has to be made');
    }
  }
});

test('the summary says whether a skeleton can be started from or has to be made', () => {
  assert.match(targetSummary({ core: 'glucose', groups: [], match: 'carries' }), /one of the starting molecules/);
  assert.match(targetSummary({ core: 'fructose', groups: [], match: 'carries' }), /has to rearrange something into it/);
});

test('an empty target is described without contradicting itself', () => {
  assert.doesNotMatch(describeTarget({ core: 'glucose', groups: [], match: 'carries' }), /nothing else.*possibly more/);
  assert.match(describeTarget({ core: 'glucose', groups: [], match: 'exact' }), /nothing else/);
});

test('the note on screen says the model only reads the sentence', () => {
  assert.match(PICKER_NOTE, /search/);
  assert.match(PICKER_NOTE, /cannot add a step/);
  assert.equal(screenPickerText(PICKER_NOTE, entries).ok, true, 'the app\'s own note must pass its own screen');
});
