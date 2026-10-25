// Which query a reference search actually gets, and what it falls back to.
//
// The bug this pins: the Lipase catalogue card showed no citations at all,
// because Google Scholar returns zero results for "Lipase enzyme" while
// returning eight for plain "lipase". The nudge that disambiguates most card
// names strangles that one, so an empty first attempt now retries bare.

import test from 'node:test';
import assert from 'node:assert/strict';
import { searchQueries, searchWithFallback } from '../tools/api/sourceQuery.mjs';
import { catalogue } from './helpers.js';

test('an enzyme card asks the decorated name first, then the bare one', () => {
  assert.deepEqual(searchQueries('Lipase', 'enzyme'), ['Lipase enzyme', 'Lipase']);
});

test('a failure-mode query is asked once and never decorated', () => {
  // These are full phrases written for the search; there is nothing to strip
  // back to, and appending to them only narrows them to nothing.
  const phrase = 'fusion order N-terminal C-terminal effect on enzyme activity bifunctional';
  assert.deepEqual(searchQueries(phrase, 'failure-mode'), [phrase]);
});

test('a name that already ends in the nudge is not asked twice', () => {
  assert.deepEqual(searchQueries('Restriction enzyme', 'enzyme'), ['Restriction enzyme']);
  assert.deepEqual(searchQueries('restriction ENZYME', 'enzyme'), ['restriction ENZYME']);
});

test('an empty or blank name asks nothing at all', () => {
  for (const empty of ['', '   ', null, undefined]) {
    assert.deepEqual(searchQueries(empty, 'enzyme'), [], `"${empty}" should produce no query`);
  }
});

test('every catalogue card has a bare-name fallback to fall back to', () => {
  // The fallback is what saves a card whose decorated phrase finds nothing, so
  // every card needs one and the bare name must be the last thing tried.
  for (const e of catalogue.entries) {
    const queries = searchQueries(e.name, 'enzyme');
    assert.ok(queries.length >= 1, `${e.name}: no query at all`);
    assert.equal(queries.at(-1), e.name, `${e.name}: the last attempt must be the bare name`);
  }
});

/* ---------- the fallback itself ---------- */

// The backend with the bug is the one that needs a SerpApi key, so the retry is
// tested against a stub that reproduces what Scholar actually did: eight hits
// for "lipase", none for "Lipase enzyme".
const scholarStub = (empty) => {
  const asked = [];
  const search = async (q) => {
    asked.push(q);
    return empty.includes(q)
      ? { provider: 'stub', results: [] }
      : { provider: 'stub', results: [{ title: `a paper about ${q}`, link: 'x' }] };
  };
  return { search, asked };
};

test('the Lipase case: an empty decorated query falls back to the bare name', async () => {
  const { search, asked } = scholarStub(['Lipase enzyme']);
  const out = await searchWithFallback(searchQueries('Lipase', 'enzyme'), search);

  assert.deepEqual(asked, ['Lipase enzyme', 'Lipase'], 'it should try decorated, then bare');
  assert.equal(out.asked, 'Lipase', 'and report that the bare name is what answered');
  assert.equal(out.results.length, 1, 'the card must not be left with no citations');
});

test('a first attempt that works is the only attempt made', async () => {
  // The fallback must not double every search: one extra round trip per card
  // against a rate-limited backend is a real cost.
  const { search, asked } = scholarStub([]);
  const out = await searchWithFallback(searchQueries('Hexokinase', 'enzyme'), search);

  assert.deepEqual(asked, ['Hexokinase enzyme'], 'the bare name should not be asked');
  assert.equal(out.asked, 'Hexokinase enzyme');
  assert.equal(out.results.length, 1);
});

test('when nothing answers at all, the caller still learns what was asked', async () => {
  const { search, asked } = scholarStub(['Lipase enzyme', 'Lipase']);
  const out = await searchWithFallback(searchQueries('Lipase', 'enzyme'), search);

  assert.deepEqual(asked, ['Lipase enzyme', 'Lipase'], 'both attempts should be spent');
  assert.equal(out.results.length, 0);
  assert.equal(out.asked, 'Lipase', 'the last thing tried is what the panel reports');
});

test('a failure-mode query is never retried, because there is nothing to retry with', async () => {
  const phrase = 'substrate channelling bifunctional fusion enzyme domain orientation';
  const { search, asked } = scholarStub([phrase]);
  const out = await searchWithFallback(searchQueries(phrase, 'failure-mode'), search);

  assert.deepEqual(asked, [phrase], 'one attempt only');
  assert.equal(out.results.length, 0);
});
