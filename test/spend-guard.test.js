// The guard in front of the server-side Gemini key: a few calls a minute per
// address, a daily allowance for the box, and a plain sentence when refused.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSpendGuard, clientAddress } from '../tools/api/spendGuard.mjs';

function clock(start = Date.UTC(2026, 9, 25, 12, 0, 0)) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('per-address limit refuses the next call within the minute and frees after it', () => {
  const c = clock();
  const guard = makeSpendGuard({ perMinute: 3, perDay: 100, now: c.now });
  for (let i = 0; i < 3; i++) assert.equal(guard.check('1.1.1.1').ok, true);
  const refused = guard.check('1.1.1.1');
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 429);
  assert.match(refused.error, /a minute/);
  assert.equal(guard.check('2.2.2.2').ok, true, 'another address is not affected');
  c.advance(60_000);
  assert.equal(guard.check('1.1.1.1').ok, true);
});

test('daily allowance counts every address together and resets at midnight UTC', () => {
  const c = clock(Date.UTC(2026, 9, 25, 23, 59, 30));
  const guard = makeSpendGuard({ perMinute: 100, perDay: 4, now: c.now });
  assert.equal(guard.check('a').ok, true);
  assert.equal(guard.check('b').ok, true);
  assert.equal(guard.check('c').ok, true);
  assert.equal(guard.check('d').remainingToday, 0);
  const refused = guard.check('e');
  assert.equal(refused.ok, false);
  assert.match(refused.error, /daily allowance of 4/);
  c.advance(60_000); // past midnight
  assert.equal(guard.check('e').ok, true);
});

test('a refused call does not count against the day', () => {
  const guard = makeSpendGuard({ perMinute: 1, perDay: 2, now: () => Date.UTC(2026, 9, 25) });
  assert.equal(guard.check('a').ok, true);
  assert.equal(guard.check('a').ok, false);
  assert.equal(guard.check('b').remainingToday, 0);
});

test('clientAddress prefers the first forwarded address and falls back to the socket', () => {
  assert.equal(clientAddress({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } }), '9.9.9.9');
  assert.equal(clientAddress({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
  assert.equal(clientAddress({ headers: {} }), 'unknown');
});
