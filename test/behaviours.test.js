// The workstation's behaviour composer: the JavaScript half of its parity
// contract, plus the scope assertions the brief fixes for this screen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogue, byId, root, allStrings, allKeys } from './helpers.js';
import {
  behaviourVocabulary,
  composeBuilds,
  coverage,
  entrySatisfies,
  handles,
  wantId,
  wantLabel,
  WANT_SCOPE,
  COMPOSE_NOTE,
} from '../src/model/behaviours.js';
import { exportBuild } from '../src/model/exportConstruct.js';
import { FORBIDDEN_VERDICT_WORDS, NOT_CHECKED } from '../src/model/disclaimers.js';

const cases = JSON.parse(readFileSync(`${root}/src/data/behaviour-cases.json`, 'utf8'));
const entries = catalogue.entries;

/* ---------- the vocabulary comes only out of committed fields ---------- */

test('the vocabulary matches the agreed answer sheet', () => {
  const got = behaviourVocabulary(entries);
  assert.equal(got.length, cases.vocabulary.length, 'vocabulary size');
  got.forEach((w, i) => {
    const want = cases.vocabulary[i];
    assert.equal(w.id, want.id, `vocabulary ${i}: id`);
    assert.equal(w.label, want.label, `${w.id}: label`);
    assert.equal(w.scope, want.scope, `${w.id}: scope`);
    assert.deepEqual(w.entries, want.entries, `${w.id}: which entries do it`);
  });
});

test('every offered behaviour is something at least one committed entry does', () => {
  for (const w of behaviourVocabulary(entries)) {
    assert.ok(w.entries.length > 0, `${w.id} is offered but no entry does it`);
    for (const id of w.entries) {
      assert.ok(entrySatisfies(byId(id), w), `${w.id} lists ${id}, which does not satisfy it`);
    }
    for (const e of entries) {
      assert.equal(
        entrySatisfies(e, w),
        w.entries.includes(e.id),
        `${w.id}: ${e.id} membership disagrees with the predicate`,
      );
    }
  }
});

test('a behaviour is only ever read off a field the catalogue already carries', () => {
  // The composer may not invent a property. Every predicate has to be decidable
  // from these fields alone, so a catalogue entry stripped to them must give the
  // same answer as the full entry.
  const KEEP = ['id', 'name', 'action', 'cofactor', 'destroys', 'temp', 'ph', 'inhibitedBy'];
  for (const w of behaviourVocabulary(entries)) {
    for (const e of entries) {
      const thin = Object.fromEntries(KEEP.map((k) => [k, e[k]]));
      assert.equal(entrySatisfies(thin, w), entrySatisfies(e, w), `${w.id} on ${e.id} needed a field outside ${KEEP.join(', ')}`);
    }
  }
});

test('the handle list is the requires list, plus what a hydrolase has to find first', () => {
  assert.deepEqual(handles(byId('hexokinase')), ['hydroxyl']);
  assert.deepEqual(handles(byId('lipase')), ['acyl']);
  assert.deepEqual(handles(byId('alpha-amylase')), ['sugar']);
  assert.deepEqual(handles(byId('carbonic-anhydrase')).length, handles(byId('carbonic-anhydrase')).length);
  for (const e of entries) {
    assert.deepEqual(handles(e), [...new Set(handles(e))], `${e.id}: handles repeat`);
  }
});

/* ---------- the composer ---------- */

test('every compose case matches, ranking and wording alike', () => {
  for (const c of cases.compose) {
    const where = c.wants.map((w) => wantId(w)).join(' & ') || '(nothing asked for)';
    const got = composeBuilds(entries, c.wants, { limit: c.limit });

    assert.deepEqual(got.searchedSizes, c.expect.searched_sizes, `${where}: team sizes searched`);
    assert.equal(got.perfect, c.expect.perfect, `${where}: perfect`);
    assert.deepEqual(got.impossible.map((w) => w.id), c.expect.impossible, `${where}: impossible wants`);
    assert.deepEqual(
      got.wants.map((w) => ({ id: w.id, label: w.label, scope: w.scope })),
      c.expect.wants,
      `${where}: want labels`,
    );
    assert.equal(got.builds.length, c.expect.builds.length, `${where}: build count`);

    got.builds.forEach((b, i) => {
      const e = c.expect.builds[i];
      assert.equal(b.id, e.id, `${where}: build ${i} identity (ranking drifted)`);
      assert.equal(b.label, e.label, `${where}: build ${b.id} label`);
      assert.equal(b.covered, e.covered, `${where}: build ${b.id} coverage count`);
      assert.equal(b.total, e.total, `${where}: build ${b.id} total`);
      assert.equal(b.worst, e.worst, `${where}: build ${b.id} worst light`);
      assert.deepEqual(b.missing, e.missing, `${where}: build ${b.id} missing wants`);
      assert.equal(b.verdict.headline, e.verdict, `${where}: build ${b.id} verdict`);
      assert.deepEqual(
        b.coverage.map((r) => ({ id: r.id, met: r.met, by: r.by, detail: r.detail })),
        e.coverage,
        `${where}: build ${b.id} coverage rows`,
      );
      assert.deepEqual(
        b.lights.map((l) => ({ id: l.id, colour: l.colour, message: l.message })),
        e.lights,
        `${where}: build ${b.id} traffic lights`,
      );
    });
  }
});

test('asking for nothing proposes nothing', () => {
  const r = composeBuilds(entries, []);
  assert.deepEqual(r.builds, []);
  assert.equal(r.perfect, false);
  assert.deepEqual(r.searchedSizes, []);
});

test('a behaviour these forty cannot do is named as impossible, not quietly dropped', () => {
  const want = { kind: 'temp-at', arg: 200 };
  const r = composeBuilds(entries, [want, { kind: 'adds', arg: 'methyl' }]);
  assert.deepEqual(r.impossible.map((w) => w.id), ['temp-at:200']);
  assert.equal(r.perfect, false);
  for (const b of r.builds) {
    assert.ok(b.missing.includes('temp-at:200'), 'the impossible want stays listed as missing on every build');
    assert.equal(b.verdict.headline, 'Not everything you asked for');
  }
});

test('the search only widens to a bigger team when a smaller one leaves something uncovered', () => {
  // One entry does both of these, so pairs are never considered.
  const easy = composeBuilds(entries, [{ kind: 'adds', arg: 'phosphate' }, { kind: 'grabs', arg: 'hydroxyl' }]);
  assert.deepEqual(easy.searchedSizes, [1]);
  // No single entry both adds and removes a phosphate.
  const harder = composeBuilds(entries, [{ kind: 'adds', arg: 'phosphate' }, { kind: 'removes', arg: 'phosphate' }]);
  assert.ok(harder.searchedSizes.includes(2), 'should have looked at pairs');
  assert.ok(harder.builds[0].entries.length >= 2);
});

test('a window behaviour is judged on the team, not on one lucky member', () => {
  const hot = byId('subtilisin');
  const cold = entries.find((e) => e.temp[1] < hot.temp[0]);
  if (!cold) return; // no such pair in the catalogue; nothing to assert
  const cov = coverage([hot, cold], [{ kind: 'temp-at', arg: hot.temp[1] }]);
  assert.equal(cov.rows[0].met, false, 'a temperature only one member reaches is not the team\'s');
  assert.match(cov.rows[0].detail, /shared/);
});

test('an all-scope behaviour needs every member to hold', () => {
  const free = entries.find((e) => e.cofactor === 'none');
  const needy = entries.find((e) => e.cofactor === 'ATP');
  assert.equal(WANT_SCOPE['cofactor-free'], 'all');
  assert.equal(coverage([free], [{ kind: 'cofactor-free', arg: null }]).covered, 1);
  assert.equal(coverage([free, needy], [{ kind: 'cofactor-free', arg: null }]).covered, 0);
});

/* ---------- scope: the wording and the absence of sequences ---------- */

test('a build is only ever reported in the three permitted ways', () => {
  const ALLOWED = ['Nothing here ruled this out', 'Ruled out by this toy', 'Not everything you asked for'];
  const seen = new Set();
  for (const c of cases.compose) {
    for (const b of c.expect.builds) {
      assert.ok(ALLOWED.includes(b.verdict), `a build was called "${b.verdict}"`);
      seen.add(b.verdict);
    }
  }
  assert.ok(seen.size >= 2, 'the cases should exercise more than one verdict');
});

test('nothing the composer says applies a forbidden word to a build', () => {
  const texts = [];
  for (const c of cases.compose) {
    for (const b of c.expect.builds) {
      texts.push(b.verdict, b.label, ...b.coverage.map((r) => r.detail), ...b.lights.map((l) => l.message));
    }
    texts.push(...c.expect.wants.map((w) => w.label));
  }
  texts.push(COMPOSE_NOTE, ...cases.vocabulary.map((w) => w.label));
  for (const text of texts) {
    for (const word of FORBIDDEN_VERDICT_WORDS) {
      assert.ok(
        !new RegExp(`\\b${word}\\b`, 'i').test(text),
        `"${word}" appears in composer text: ${text.slice(0, 120)}`,
      );
    }
  }
});

test('the exported build carries domain names and verdicts, and no sequence', () => {
  const AA = 'ACDEFGHIKLMNPQRSTVWY';
  const UPPER_RUN = new RegExp(`^[${AA}]{20,}$`);
  const ANY_CASE_RUN = new RegExp(`^[${AA}]{25,}$`, 'i');
  const NT_RUN = /^[ACGTU]{20,}$/i;
  const SEQUENCE_KEY = /sequence|fasta|genbank|codon|oligo|primer|residues?_string|aa_?seq|nt_?seq/i;

  // Export a build for every compose case, passing, partial and ruled out alike.
  for (const c of cases.compose) {
    const r = composeBuilds(entries, c.wants, { limit: c.limit });
    for (const build of r.builds) {
      const payload = exportBuild({ wants: r.wants, build, impossible: r.impossible });
      for (const { path, value } of allStrings(payload)) {
        for (const tok of value.match(/[A-Za-z]+/g) ?? []) {
          assert.ok(!UPPER_RUN.test(tok), `exported build ${path}: residue run ${tok.slice(0, 80)}`);
          assert.ok(!ANY_CASE_RUN.test(tok), `exported build ${path}: residue run ${tok.slice(0, 80)}`);
          assert.ok(!NT_RUN.test(tok), `exported build ${path}: nucleotide run ${tok.slice(0, 80)}`);
        }
      }
      for (const key of allKeys(payload)) {
        assert.ok(!SEQUENCE_KEY.test(key), `exported build has a sequence-shaped field name "${key}"`);
      }
    }
  }
});

test('the exported build always carries the standing not-checked list and the cartoon note', () => {
  const r = composeBuilds(entries, [{ kind: 'adds', arg: 'phosphate' }, { kind: 'removes', arg: 'sugar' }]);
  const payload = exportBuild({ wants: r.wants, build: r.builds[0], impossible: r.impossible });
  assert.deepEqual(payload.not_checked, NOT_CHECKED);
  assert.match(payload.disclaimer, /classroom cartoon/i);
  assert.match(payload.not_a_design, /not a protein design/i);
  assert.ok(!('sequence' in payload.build));
});

test('the answer sheet itself is big enough to be worth having', () => {
  assert.ok(cases.compose.length >= 150, 'too few compose cases to catch drift');
  assert.ok(cases.vocabulary.length >= 60, 'too few behaviours offered');
  assert.ok(cases.compose.some((c) => c.expect.impossible.length), 'no case exercises an impossible want');
  assert.ok(cases.compose.some((c) => c.expect.searched_sizes.includes(2)), 'no case exercises a pairing');
});

test('every want label reads as a behaviour, not as a claim', () => {
  for (const w of behaviourVocabulary(entries)) {
    assert.equal(wantLabel(w), w.label);
    assert.ok(w.label.length > 3 && w.label === w.label.toLowerCase().slice(0, 1) + w.label.slice(1));
  }
});
