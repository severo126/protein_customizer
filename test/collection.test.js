// The collection screen's two honesty claims, pinned.
//
// A card deals itself into an archetype and draws a row of stat bars. Both are
// only worth showing if they are true: every one of the forty has to be filed
// under a real class, and every bar has to be a reading of a committed field
// that says what it measures.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { root, catalogue } from './helpers.js';
import { ARCHETYPES, ARCHETYPE_OF, archetypeOf, deal, dealtOrder } from '../src/model/archetypes.js';
import { ratings, factChips, TEMP_AXIS, PH_AXIS } from '../src/model/ratings.js';
import { HOSTS, supports } from '../src/model/hosts.js';

const entries = catalogue.entries;

test('every catalogue entry is filed under an archetype that exists', () => {
  for (const e of entries) {
    const a = archetypeOf(e);
    assert.ok(a, `${e.id} is in no archetype — add a line to ARCHETYPE_OF rather than letting the screen guess`);
    assert.ok(ARCHETYPES.some((x) => x.id === a.id));
  }
});

test('the archetype table files nothing that is not in the catalogue', () => {
  const ids = new Set(entries.map((e) => e.id));
  for (const id of Object.keys(ARCHETYPE_OF)) {
    assert.ok(ids.has(id), `ARCHETYPE_OF has a line for "${id}", which is not in the catalogue`);
  }
});

test('dealing the deck loses nothing and duplicates nothing', () => {
  const order = dealtOrder(entries);
  assert.equal(order.length, entries.length);
  assert.equal(new Set(order.map((e) => e.id)).size, entries.length);
  assert.equal(deal(entries).unplaced.length, 0);
});

test('every archetype carries its real class alongside the playful name', () => {
  for (const a of ARCHETYPES) {
    assert.match(a.ec, /EC \d/, `${a.id} must name the enzyme class it stands for`);
    assert.ok(a.does.length > 20, `${a.id} must say what the class does`);
  }
});

test('every stat bar says what it measures', () => {
  for (const e of entries) {
    for (const r of ratings(e)) {
      assert.ok(r.label, `${e.id} has a bar with no label`);
      assert.ok(r.what && r.what.length > 40, `${e.id}'s "${r.label}" bar does not say what it measures`);
      assert.ok(['range', 'band', 'count'].includes(r.kind));
    }
  }
});

test('a bar reads a committed catalogue field, never an invented number', () => {
  for (const e of entries) {
    const by = Object.fromEntries(ratings(e).map((r) => [r.id, r]));
    assert.deepEqual([by.temp.lo, by.temp.hi], e.temp);
    assert.deepEqual([by.ph.lo, by.ph.hi], e.ph);
    assert.equal(by.rate.value, e.rate);
    assert.equal(by.drive.value, e.drive);
    assert.equal(by.hosts.value, HOSTS.filter((h) => supports(h.id, e).ok).length);
    assert.equal(by.hosts.max, HOSTS.length);
  }
});

test('the windows are drawn against one fixed axis, so two cards compare', () => {
  assert.deepEqual(TEMP_AXIS, [0, 100]);
  assert.deepEqual(PH_AXIS, [0, 14]);
  for (const e of entries) {
    const by = Object.fromEntries(ratings(e).map((r) => [r.id, r]));
    for (const r of [by.temp, by.ph]) {
      assert.ok(r.left >= 0 && r.left + r.width <= 100);
    }
  }
});

test('a missing field reads unknown rather than sitting at a middle value', () => {
  const blank = { ...entries[0], rate: undefined, drive: undefined, temp: [undefined, undefined] };
  const by = Object.fromEntries(ratings(blank).map((r) => [r.id, r]));
  for (const id of ['rate', 'drive', 'temp']) {
    assert.equal(by[id].unknown, true, `${id} must report unknown`);
    assert.equal(by[id].display, 'unknown');
    assert.ok(!('index' in by[id]), 'an unknown band must not land on a band');
  }
  assert.equal(factChips({ ...entries[0], assembly: undefined })[0].value, 'unknown');
});

test('the collection screen keeps the not-a-coordinate-set labelling', () => {
  const view = readFileSync(`${root}/src/ui/collection-view.js`, 'utf8');
  assert.match(view, /not a coordinate set/i);
  assert.match(view, /Cartoon figure/i);
  // The figure may only be built from the entry's own region list.
  assert.match(view, /entry\.domain/);
});
