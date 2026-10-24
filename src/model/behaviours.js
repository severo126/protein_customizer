// The workstation: search the catalogue by the behaviour you want, not by name.
//
// Every behaviour in here is read straight off a field that already exists in
// src/data/catalogue.json — action.requires, action.op, action.group, temp, ph,
// cofactor, destroys, inhibitedBy. Nothing is looked up, fetched, inferred or
// modelled. There is no database behind this file and no way to add an entry to
// the forty; see docs/scope.md §1.
//
// What a "build" is: a named set of one, two or three catalogue domains. It is
// not a protein, not a design, and carries no sequence of any kind (§2). That
// a build "covers" a behaviour means only that a committed catalogue field says
// the entry does that — it is not a prediction that the team would run, fold,
// express or exist (§3).

import { groupMeta, prettyCore } from './molecules.js';
import { intersectWindows, cofactorTokens, cofactorFamily, teamReport } from './compatibility.js';

export const COMPOSE_NOTE =
  'A build is a named set of catalogue domains and cartoon geometry. Covering a behaviour means only that a committed field in the catalogue says so. It is not a prediction that the team would run, fold, express, or exist.';

export const CLOSEST_NOTE =
  'These are the entries and pairings of the fixed forty that cover the most of what you asked for. "Closest" is a count of covered behaviours, not a ranking of quality.';

// How a want is judged against a team of more than one entry.
//
//   any  — one member doing it is enough
//   all  — every member has to hold, or the property is not the team's
//   team — the property only exists for the team, via the shared window
export const WANT_SCOPE = {
  grabs: 'any',
  adds: 'any',
  removes: 'any',
  joins: 'any',
  rearranges: 'any',
  'runs-on': 'any',
  'cofactor-free': 'all',
  'unbothered-by': 'all',
  spares: 'all',
  'temp-at': 'team',
  'ph-at': 'team',
};

export const WANT_QUESTIONS = [
  { kind: 'grabs', question: 'Grabs onto a molecule carrying…' },
  { kind: 'adds', question: 'Puts a group on…' },
  { kind: 'removes', question: 'Takes a group off…' },
  { kind: 'joins', question: 'Joins groups into…' },
  { kind: 'rearranges', question: 'Rearranges a skeleton…' },
  { kind: 'temp-at', question: 'Has to work at…' },
  { kind: 'ph-at', question: 'Has to work at pH…' },
  { kind: 'runs-on', question: 'Runs on the cofactor…' },
  { kind: 'cofactor-free', question: 'Needs no cofactor at all' },
  { kind: 'spares', question: 'Leaves a cofactor alone for the rest of the team…' },
  { kind: 'unbothered-by', question: 'Is not listed as inhibited by…' },
];

export function wantId(want) {
  return want.arg === null || want.arg === undefined ? want.kind : `${want.kind}:${want.arg}`;
}

// "a hydroxyl" but "an acyl" — the labels are read aloud in the picker.
export function article(word) {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

export function wantLabel(want) {
  const g = (name) => article(groupMeta(name).label);
  switch (want.kind) {
    case 'grabs':
      return `grabs a molecule carrying ${g(want.arg)}`;
    case 'adds':
      return `puts ${g(want.arg)} on`;
    case 'removes':
      return `takes ${g(want.arg)} off`;
    case 'joins':
      return `joins groups into ${g(want.arg)}`;
    case 'rearranges':
      return `rearranges a ${prettyCore(want.arg)} skeleton`;
    case 'temp-at':
      return `works at ${want.arg} °C`;
    case 'ph-at':
      return `works at pH ${want.arg}`;
    case 'runs-on':
      return `runs on ${want.arg}`;
    case 'cofactor-free':
      return 'needs no cofactor';
    case 'spares':
      return `leaves ${want.arg} alone for the rest of the team`;
    case 'unbothered-by':
      return `is not listed as inhibited by ${groupMeta(want.arg).label}`;
    default:
      return `${want.kind} ${want.arg ?? ''}`.trim();
  }
}

// The groups an entry needs to find on the molecule before it will do anything:
// what action.requires names, plus — for a hydrolase-shaped entry — the group it
// cuts off, since that is the handle it has to find first.
export function handles(entry) {
  const a = entry.action;
  const out = [...(a.requires ?? [])];
  if (a.op === 'remove' && a.group) out.push(a.group);
  return [...new Set(out)];
}

export function entrySatisfies(entry, want) {
  const a = entry.action;
  switch (want.kind) {
    case 'grabs':
      return handles(entry).includes(want.arg);
    case 'adds':
      return a.op === 'add' && a.group === want.arg;
    case 'removes':
      return a.op === 'remove' && a.group === want.arg;
    case 'joins':
      return a.op === 'join' && a.group === want.arg;
    case 'rearranges':
      return a.op === 'rearrange' && a.from === want.arg;
    case 'temp-at':
      return entry.temp[0] <= want.arg && want.arg <= entry.temp[1];
    case 'ph-at':
      return entry.ph[0] <= want.arg && want.arg <= entry.ph[1];
    case 'runs-on':
      return cofactorTokens(entry.cofactor).map(cofactorFamily).includes(cofactorFamily(want.arg));
    case 'cofactor-free':
      return cofactorTokens(entry.cofactor).length === 0;
    case 'spares':
      return !(entry.destroys ?? []).some((d) => cofactorFamily(d) === cofactorFamily(want.arg));
    case 'unbothered-by':
      return !(entry.inhibitedBy ?? []).includes(want.arg);
    default:
      return false;
  }
}

/* ---------- the vocabulary the picker offers ---------- */

// Offered temperature and pH marks. Fixed steps across the span the forty
// entries actually cover, so the picker cannot offer a figure no entry could
// ever meet, and so both implementations offer exactly the same list.
const TEMP_STEP = 5;
const PH_STEP = 0.5;

export function behaviourVocabulary(entries) {
  const groups = { grabs: new Set(), adds: new Set(), removes: new Set(), joins: new Set(), rearranges: new Set(), 'runs-on': new Set(), 'unbothered-by': new Set() };
  for (const e of entries) {
    for (const g of handles(e)) groups.grabs.add(g);
    if (e.action.op === 'add' && e.action.group) groups.adds.add(e.action.group);
    if (e.action.op === 'remove' && e.action.group) groups.removes.add(e.action.group);
    if (e.action.op === 'join' && e.action.group) groups.joins.add(e.action.group);
    if (e.action.op === 'rearrange' && e.action.from) groups.rearranges.add(e.action.from);
    for (const tok of cofactorTokens(e.cofactor)) groups['runs-on'].add(tok);
    for (const g of e.inhibitedBy ?? []) groups['unbothered-by'].add(g);
  }

  const wants = [];
  const push = (kind, arg) => wants.push({ kind, arg });
  for (const kind of ['grabs', 'adds', 'removes', 'joins', 'rearranges', 'runs-on', 'unbothered-by']) {
    for (const arg of [...groups[kind]].sort()) push(kind, arg);
  }

  const tLow = Math.min(...entries.map((e) => e.temp[0]));
  const tHigh = Math.max(...entries.map((e) => e.temp[1]));
  for (let t = Math.ceil(tLow / TEMP_STEP) * TEMP_STEP; t <= tHigh; t += TEMP_STEP) push('temp-at', t);

  const pLow = Math.min(...entries.map((e) => e.ph[0]));
  const pHigh = Math.max(...entries.map((e) => e.ph[1]));
  for (let p = Math.ceil(pLow / PH_STEP) * PH_STEP; p <= pHigh + 1e-9; p += PH_STEP) push('ph-at', round1(p));

  push('cofactor-free', null);
  for (const arg of [...groups['runs-on']].sort()) push('spares', arg);

  // Only offer a behaviour some committed entry can actually show, and say how
  // many of the forty do, so the picker never implies the catalogue is bigger
  // than it is.
  return wants
    .map((w) => ({ ...w, id: wantId(w), label: wantLabel(w), scope: WANT_SCOPE[w.kind], entries: entries.filter((e) => entrySatisfies(e, w)).map((e) => e.id) }))
    .filter((w) => w.entries.length > 0);
}

/* ---------- coverage ---------- */

export function coverFor(team, want) {
  const scope = WANT_SCOPE[want.kind];
  if (!team.length) return { met: false, by: [], detail: 'No entries picked yet.' };

  if (scope === 'team') {
    const key = want.kind === 'temp-at' ? 'temp' : 'ph';
    const w = intersectWindows(team, key);
    const unit = key === 'temp' ? ' °C' : '';
    const prefix = key === 'temp' ? '' : 'pH ';
    if (w.empty) {
      return { met: false, by: [], detail: `This team has no shared ${key === 'temp' ? 'temperature' : 'pH'} window at all: ${w.blame.floor.name} needs ${prefix}${w.blame.floor[key][0]}${unit} or above and ${w.blame.ceiling.name} needs ${prefix}${w.blame.ceiling[key][1]}${unit} or below.` };
    }
    const inside = w.low <= want.arg && want.arg <= w.high;
    return {
      met: inside,
      by: inside ? team.map((e) => e.id) : [],
      detail: inside
        ? `The shared window is ${prefix}${w.low}–${w.high}${unit}, which contains ${prefix}${want.arg}${unit}.`
        : `The shared window is only ${prefix}${w.low}–${w.high}${unit}, which leaves ${prefix}${want.arg}${unit} outside it.`,
    };
  }

  const yes = team.filter((e) => entrySatisfies(e, want));
  if (scope === 'all') {
    const no = team.filter((e) => !entrySatisfies(e, want));
    return {
      met: no.length === 0,
      by: no.length === 0 ? team.map((e) => e.id) : [],
      detail: no.length === 0 ? `Every member of this build holds.` : `${no.map((e) => e.name).join(' and ')} ${no.length === 1 ? 'does' : 'do'} not.`,
    };
  }
  return {
    met: yes.length > 0,
    by: yes.map((e) => e.id),
    detail: yes.length ? `${yes.map((e) => e.name).join(' and ')} ${yes.length === 1 ? 'does' : 'do'} this.` : 'No member of this build does this.',
  };
}

export function coverage(team, wants) {
  const rows = wants.map((want) => ({ want, id: wantId(want), label: wantLabel(want), scope: WANT_SCOPE[want.kind], ...coverFor(team, want) }));
  return { rows, covered: rows.filter((r) => r.met).length, total: rows.length, missing: rows.filter((r) => !r.met).map((r) => r.id) };
}

/* ---------- the search ---------- */

// Ranking in two passes so both implementations agree exactly. First every
// combination is scored on coverage alone and sorted on keys that cannot tie
// (coverage, size, then the ids themselves); the first SHORTLIST of those get
// their traffic lights run, and the final order folds the lights in.
export const SHORTLIST = 60;
export const DEFAULT_LIMIT = 6;
export const MAX_TEAM = 3;

const LIGHT_RANK = { green: 0, grey: 1, amber: 2, red: 3 };

export function composeBuilds(entries, wants, { limit = DEFAULT_LIMIT, maxTeam = MAX_TEAM } = {}) {
  const impossible = wants
    .filter((w) => !entries.some((e) => entrySatisfies(e, w)))
    .map((w) => ({ id: wantId(w), label: wantLabel(w) }));

  if (!wants.length) {
    return { builds: [], impossible, searchedSizes: [], wants: [], note: COMPOSE_NOTE, closestNote: CLOSEST_NOTE, perfect: false };
  }

  const scored = [];
  const searchedSizes = [];
  let best = -1;

  for (let size = 1; size <= Math.min(maxTeam, entries.length); size++) {
    // Only widen the search when a smaller build still leaves something uncovered.
    if (size > 1 && best >= wants.length) break;
    searchedSizes.push(size);
    for (const combo of combinations(entries, size)) {
      const cov = coverage(combo, wants);
      if (cov.covered > best) best = cov.covered;
      scored.push({ combo, cov });
    }
  }

  scored.sort(
    (a, b) =>
      b.cov.covered - a.cov.covered ||
      a.combo.length - b.combo.length ||
      ids(a.combo).localeCompare(ids(b.combo)),
  );

  const shortlist = scored.slice(0, SHORTLIST).map(({ combo, cov }) => {
    const team = teamReport(combo, null);
    return {
      id: ids(combo),
      entries: combo,
      entryIds: combo.map((e) => e.id),
      label: combo.map((e) => e.name).join(' + '),
      domains: combo.map((e) => ({ parent: e.name, parentId: e.id, domain: e.domain.label })),
      covered: cov.covered,
      total: cov.total,
      coverage: cov.rows,
      missing: cov.missing,
      lights: team.lights,
      worst: team.worst,
      verdict: buildVerdict(cov, team.worst),
    };
  });

  shortlist.sort(
    (a, b) =>
      b.covered - a.covered ||
      LIGHT_RANK[a.worst] - LIGHT_RANK[b.worst] ||
      a.entries.length - b.entries.length ||
      a.id.localeCompare(b.id),
  );

  const builds = shortlist.slice(0, limit);
  return {
    builds,
    impossible,
    searchedSizes,
    wants: wants.map((w) => ({ id: wantId(w), label: wantLabel(w), scope: WANT_SCOPE[w.kind] })),
    note: COMPOSE_NOTE,
    closestNote: CLOSEST_NOTE,
    perfect: builds.length > 0 && builds[0].covered === wants.length && builds[0].worst !== 'red',
  };
}

// The only two things a build is ever allowed to be called. Neither of them is a
// claim about the real world; test/wording.test.js holds this to the brief.
export function buildVerdict(cov, worst) {
  if (cov.covered < cov.total) {
    return {
      headline: 'Not everything you asked for',
      detail: `This build covers ${cov.covered} of ${cov.total}. ${cov.total - cov.covered} behaviour${cov.total - cov.covered === 1 ? '' : 's'} went uncovered — they are listed beside it.`,
    };
  }
  if (worst === 'red') {
    return { headline: 'Ruled out by this toy', detail: 'Every behaviour you asked for is covered, but a cartoon compatibility check went red. The light says which two entries caused it.' };
  }
  return {
    headline: 'Nothing here ruled this out',
    detail: 'Every behaviour you asked for is named by a committed catalogue field, and no cartoon compatibility check went red. That is the absence of a red flag from a cartoon, and nothing more.',
  };
}

function ids(combo) {
  return combo.map((e) => e.id).join('+');
}

function round1(n) {
  return Number(n.toFixed(1));
}

// Index-increasing combinations, so the order is the catalogue's order and both
// implementations walk the space identically.
export function* combinations(list, size) {
  const idx = Array.from({ length: size }, (_, i) => i);
  if (size > list.length) return;
  while (true) {
    yield idx.map((i) => list[i]);
    let k = size - 1;
    while (k >= 0 && idx[k] === list.length - size + k) k--;
    if (k < 0) return;
    idx[k]++;
    for (let j = k + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
  }
}
