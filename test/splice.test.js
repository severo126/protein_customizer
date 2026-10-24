import test from 'node:test';
import assert from 'node:assert/strict';
import { byId, catalogue } from './helpers.js';
import { runFilters, spliceFunnel, FILTERS, layout, radiusOfGyration, expectedRgBand } from '../src/model/splice.js';
import { PASS_VERDICT, NOT_CHECKED, FORBIDDEN_VERDICT_WORDS } from '../src/model/disclaimers.js';
import { exportConstruct } from '../src/model/exportConstruct.js';

const loopSite = (entry) => entry.domain.sites.find((s) => s.region === 'loop');
const structuredSite = (entry) => entry.domain.sites.find((s) => s.region !== 'loop');

test('a cut through a helix or sheet is rejected, and the reason names the element', () => {
  const a = byId('lipase');
  const b = byId('alpha-amylase');
  const v = runFilters(a, structuredSite(a), b, loopSite(b), 6);
  assert.equal(v.passed, false);
  assert.equal(v.killedBy, 'cut-site');
  assert.match(v.results[0].reason, /middle of a helix|middle of a sheet/);
});

test('a linker too short to reach the other cut end is rejected', () => {
  const a = byId('malate-synthase');
  const b = byId('accase');
  const v = runFilters(a, loopSite(a), b, loopSite(b), 2);
  assert.equal(v.passed, false);
  assert.ok(['clash', 'backbone-join'].includes(v.killedBy));
});

test('a very short linker drags the blobs through each other', () => {
  const a = byId('lipase');
  const b = byId('alpha-amylase');
  const v = runFilters(a, loopSite(a), b, loopSite(b), 2);
  assert.equal(v.killedBy, 'clash');
  assert.match(v.results[2].reason, /interpenetrate/);
});

test('a very long linker fails the compactness band', () => {
  const a = byId('lipase');
  const b = byId('alpha-amylase');
  const v = runFilters(a, loopSite(a), b, loopSite(b), 20);
  assert.equal(v.killedBy, 'compactness');
  assert.match(v.results[3].reason, /Radius of gyration/);
});

test('parents with no shared pH window fail the operating-window filter', () => {
  const a = byId('alkaline-phosphatase');
  const b = byId('invertase');
  const v = runFilters(a, loopSite(a), b, loopSite(b), 6);
  const ow = v.results.find((r) => r.id === 'operating-window');
  assert.equal(ow.pass, false);
  assert.match(ow.reason, /share no pH window/);
});

test('an otherwise-fine pair can still fail against the rest of the lane', () => {
  const a = byId('glucose-isomerase'); // will not run below 45 °C
  const b = byId('lactase');
  const team = [byId('dna-ligase')]; // gives up above 37 °C
  const v = runFilters(a, loopSite(a), b, loopSite(b), 6, team);
  const ow = v.results.find((r) => r.id === 'operating-window');
  assert.equal(ow.pass, false);
  assert.match(ow.reason, /does not overlap the rest of the lane/);
});

test('radius of gyration grows as the linker stretches the construct', () => {
  const a = byId('lipase');
  const b = byId('alpha-amylase');
  const rgs = [2, 6, 12, 20].map((L) => radiusOfGyration(layout(a.domain, loopSite(a), b.domain, loopSite(b), L)));
  for (let i = 1; i < rgs.length; i++) assert.ok(rgs[i] > rgs[i - 1], 'Rg should grow with linker length');
  const band = expectedRgBand(layout(a.domain, loopSite(a), b.domain, loopSite(b), 6));
  assert.ok(band.low < band.high);
});

test('the funnel accounts for every candidate it took in', () => {
  const f = spliceFunnel(byId('lipase'), byId('alpha-amylase'));
  assert.equal(f.went_in, 3 * 3 * 4);
  const killed = f.funnel.reduce((n, s) => n + s.killed, 0);
  assert.equal(killed + f.survivors.length, f.went_in);
  // The funnel narrows monotonically.
  for (let i = 1; i < f.funnel.length; i++) assert.ok(f.funnel[i].entering <= f.funnel[i - 1].entering);
  assert.equal(f.funnel.at(-1).leaving, f.survivors.length);
  assert.deepEqual(f.funnel.map((s) => s.id), FILTERS.map((s) => s.id));
});

test('at least one candidate clears every filter for a workable pair', () => {
  const f = spliceFunnel(byId('lipase'), byId('alpha-amylase'));
  assert.ok(f.survivors.length > 0);
  assert.ok(f.survivors.every((s) => s.results.every((r) => r.pass)));
});

test('a clearing candidate is reported as "nothing ruled this out" and never as viable', () => {
  const a = byId('lipase');
  const b = byId('alpha-amylase');
  const f = spliceFunnel(a, b);
  const survivor = f.survivors[0];
  assert.equal(f.verdictWording, PASS_VERDICT);
  assert.equal(f.verdictWording, 'Nothing here ruled this out');

  const payload = exportConstruct({ entryA: a, siteA: survivor.siteA, entryB: b, siteB: survivor.siteB, linkerUnits: survivor.linkerUnits, verdict: survivor });
  assert.equal(payload.verdict, 'Nothing here ruled this out');
  assert.deepEqual(payload.not_checked, NOT_CHECKED);
  for (const word of FORBIDDEN_VERDICT_WORDS) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(payload.verdict), `verdict must not say "${word}"`);
  }
});

test('every filter in the catalogue-wide sweep can both pass and fail something', () => {
  const totals = Object.fromEntries(FILTERS.map((f) => [f.id, 0]));
  let survivors = 0;
  const entries = catalogue.entries;
  for (let i = 0; i < entries.length; i += 2) {
    for (let j = i + 1; j < entries.length; j += 5) {
      const f = spliceFunnel(entries[i], entries[j]);
      f.funnel.forEach((s) => (totals[s.id] += s.killed));
      survivors += f.survivors.length;
    }
  }
  for (const f of FILTERS) assert.ok(totals[f.id] > 0, `${f.id} never rejected anything — it is not load-bearing`);
  assert.ok(survivors > 0, 'nothing ever survives the funnel');
});

test('results are deterministic: the same inputs give byte-identical verdicts', () => {
  const a = byId('citrate-synthase');
  const b = byId('fumarase');
  const one = JSON.stringify(spliceFunnel(a, b).candidates.map((c) => [c.id, c.killedBy]));
  const two = JSON.stringify(spliceFunnel(a, b).candidates.map((c) => [c.id, c.killedBy]));
  assert.equal(one, two);
});
