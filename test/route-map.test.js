// The map shown while you are still choosing what to make.
//
// The map's whole claim is that it draws what this catalogue can actually do,
// so the load-bearing test here is the same shape as the one over the route
// search: take every line on the map, run that enzyme on the molecule the line
// starts at, and check it produces the molecule the line ends at. A map that
// drew a connection the rules do not make would be inventing chemistry in the
// one place a reader is most likely to believe it, because a picture of a graph
// looks like a fact.

import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue } from './helpers.js';
import { runStage } from '../src/model/pipeline.js';
import { starter, STARTERS } from '../src/model/molecules.js';
import { searchRoutes, makeTarget, matchesTarget, moleculeKey } from '../src/model/routes.js';
import { exploreCatalogue, mapFor, MAP_LIMITS, MAP_NOTE } from '../src/model/route-map.js';

const entries = catalogue.entries;
const byId = new Map(entries.map((e) => [e.id, e]));

// One exploration for the whole file: it does not depend on the draft, which is
// the reason the screen can afford to redraw on every keystroke.
const EX = exploreCatalogue(entries);

const DRAFTS = [
  { core: 'glucose', groups: [], match: 'carries' },
  { core: 'glucose', groups: ['phosphate'], match: 'carries' },
  { core: 'glucose', groups: ['phosphate'], match: 'exact' },
  { core: 'fructose', groups: ['phosphate', 'hydroxyl', 'hydroxyl', 'hydroxyl'], match: 'exact' },
  { core: 'glycerate-2-p', groups: [], match: 'carries' },
  { core: 'malate', groups: ['sulfate'], match: 'exact' },
  { core: 'triose-iso', groups: [], match: 'carries' },
  { core: 'amide', groups: [], match: 'carries' },
  { core: 'nitrile', groups: ['phosphate'], match: 'exact' },
  { core: 'urea', groups: ['amine'], match: 'carries' },
];

const nodeMol = (n) => ({ core: n.core, groups: [...n.groups] });

test('the exploration finishes, so the map can say what is not reachable', () => {
  assert.ok(EX.exhausted, 'the walk ran out of budget — the map cannot make a negative claim');
  assert.ok(EX.statesSeen > 1000, 'suspiciously few molecules explored');
  assert.equal(EX.scans.length, STARTERS.length);
});

/* --------------------------- the load-bearing test ------------------------ */

test('every line on the map is an enzyme in this catalogue acting under its own rule', () => {
  let checked = 0;
  for (const draft of DRAFTS) {
    const map = mapFor(EX, draft);
    const nodes = new Map(map.nodes.map((n) => [n.key, n]));

    for (const edge of map.edges) {
      const from = nodes.get(edge.from);
      const to = nodes.get(edge.to);
      assert.ok(from, `${draft.core}: a line starts at a molecule that is not drawn`);
      assert.ok(to, `${draft.core}: a line ends at a molecule that is not drawn`);
      assert.ok(edge.enzymeIds.length > 0, `${draft.core}: a line names no enzyme`);

      for (const id of edge.enzymeIds) {
        const entry = byId.get(id);
        assert.ok(entry, `${draft.core}: a line names ${id}, which is not in the catalogue`);
        const r = runStage(nodeMol(from), entry);
        assert.ok(r.ok, `${draft.core}: ${entry.name} refuses the molecule the line starts at`);
        assert.equal(
          moleculeKey(r.product),
          edge.to,
          `${draft.core}: ${entry.name} does not turn the start of the line into its end`,
        );
        checked += 1;
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} lines checked — the drafts are not exercising the map`);
});

test('every molecule on the map is one the route search also reaches, in the depth shown', () => {
  for (const draft of DRAFTS) {
    const map = mapFor(EX, draft);
    // Spot-check rather than every node: a full search per node would be slow,
    // and the lines are already checked exhaustively above.
    // The asked-for node is deliberately NOT reachable; it has its own test.
    for (const n of map.nodes.filter((x) => x.onSkeleton && !x.isTarget).slice(0, 4)) {
      const target = makeTarget({ core: n.core, groups: n.groups, match: 'exact' });
      const result = searchRoutes(entries, target);
      if (n.depth === 0) {
        assert.ok(
          STARTERS.some((s) => moleculeKey(starter(s.id)) === n.key),
          `${n.key} is drawn at depth 0 but is not a starting molecule`,
        );
        continue;
      }
      assert.ok(result.reachable, `the map drew ${n.key} but the search says it is unreachable`);
      assert.equal(
        result.shortestDepth,
        n.depth,
        `the map drew ${n.key} at ${n.depth} stages, the search says ${result.shortestDepth}`,
      );
    }
  }
});

/* ------------------------------- the narrowing ---------------------------- */

test('a node is marked as matching exactly when it matches the draft', () => {
  for (const draft of DRAFTS) {
    const map = mapFor(EX, draft);
    const target = makeTarget(draft);
    for (const n of map.nodes) {
      // The asked-for node carries the draft's own groups, so it would "match"
      // by definition. It is marked false on purpose: it is the question, not
      // an answer, and marking it would draw it as something reachable.
      if (n.isTarget) {
        assert.equal(n.matches, false, 'the asked-for node is marked as a match');
        assert.equal(n.unreachable, true, 'the asked-for node is not marked unreachable');
        continue;
      }
      if (!n.onSkeleton) {
        assert.equal(n.matches, false, `${n.key} is off the skeleton but marked as a match`);
        continue;
      }
      // With nothing named and a loose match every variant would match, so the
      // map marks none of them: a highlight on everything says nothing. Once
      // the draft narrows at all, the marking is exact.
      const narrowing = draft.groups.length > 0 || draft.match === 'exact';
      const really = narrowing ? matchesTarget(nodeMol(n), target) : false;
      assert.equal(n.matches, really, `${n.key}: marked ${n.matches}, actually ${really}`);
    }
  }
});

test('nothing is highlighted until the draft actually rules something out', () => {
  const loose = mapFor(EX, { core: 'glucose', groups: [], match: 'carries' });
  assert.ok(loose.matchCount > 0, 'the count still reports what would match');
  assert.equal(loose.nodes.filter((n) => n.matches).length, 0, 'everything is highlighted, which says nothing');

  // The moment something is ruled out, the highlight means something.
  const narrowed = mapFor(EX, { core: 'glucose', groups: ['phosphate'], match: 'carries' });
  assert.ok(narrowed.nodes.some((n) => n.matches), 'naming a group highlighted nothing');
  assert.ok(
    narrowed.nodes.filter((n) => n.matches).length < narrowed.nodes.length,
    'naming a group still highlighted everything',
  );
});

test('a column is never taller than its budget, and keeps the matches when cut', () => {
  for (const draft of DRAFTS) {
    const map = mapFor(EX, draft);
    const cols = new Map();
    for (const n of map.nodes) cols.set(n.depth, (cols.get(n.depth) ?? 0) + 1);
    for (const [depth, n] of cols) {
      // The asked-for node sits alone in a column of its own.
      if (map.nodes.some((x) => x.depth === depth && x.isTarget)) continue;
      // A column holding pinned matches may run over by up to minMatchesDrawn,
      // which is the deliberate trade: never go blank on a specific request.
      const ceiling = MAP_LIMITS.maxPerColumn + MAP_LIMITS.minMatchesDrawn;
      assert.ok(n <= ceiling, `${draft.core}: ${n} molecules in the ${depth}-stage column, over ${ceiling}`);
    }
  }
});

test('the map never goes blank on a draft that does have an answer', () => {
  for (const draft of DRAFTS) {
    const map = mapFor(EX, draft);
    if (!map.reachable) continue;
    const narrowing = draft.groups.length > 0 || draft.match === 'exact';
    if (!narrowing) continue;
    assert.ok(
      map.nodes.some((n) => n.matches),
      `${draft.core} ${JSON.stringify(draft.groups)}: ${map.matchCount} molecules match but none is drawn`,
    );
  }
});

test('adding a group never widens the match, and asking for exactly never widens it either', () => {
  const core = 'glucose';
  const loose = mapFor(EX, { core, groups: [], match: 'carries' });
  const one = mapFor(EX, { core, groups: ['phosphate'], match: 'carries' });
  const two = mapFor(EX, { core, groups: ['phosphate', 'hydroxyl'], match: 'carries' });
  const exact = mapFor(EX, { core, groups: ['phosphate', 'hydroxyl'], match: 'exact' });

  assert.ok(one.matchCount <= loose.matchCount, 'naming a group widened the match');
  assert.ok(two.matchCount <= one.matchCount, 'naming a second group widened the match');
  assert.ok(exact.matchCount <= two.matchCount, '"exactly those" widened the match');
  assert.ok(loose.matchCount > 0, 'the loosest draft on a reachable skeleton matches nothing');
});

/* ------------------------- what it must not hide -------------------------- */

test('a target nothing can reach is reported, not hidden', () => {
  const map = mapFor(EX, { core: 'malate', groups: ['sulfate'], match: 'exact' });
  assert.equal(map.reachable, false);
  assert.equal(map.matchCount, 0);
  assert.equal(map.matches.length, 0);
  // The skeleton itself is reachable, so there is still a map to draw, and the
  // headline has to say the target is on it with nothing arriving.
  assert.ok(map.nodes.length > 1, 'the map went blank instead of showing the dead end');
  assert.match(map.headline, /none carries that/);
  assert.match(map.headline, /nothing arriving at it/);
  // And no node on it is marked as a match.
  assert.equal(map.nodes.filter((n) => n.matches).length, 0);
});

test('what was asked for is drawn with no line arriving at it', () => {
  const map = mapFor(EX, { core: 'malate', groups: ['sulfate'], match: 'exact' });
  const asked = map.nodes.filter((n) => n.isTarget);
  assert.equal(asked.length, 1, 'the unreachable target is not on the map');
  assert.deepEqual(asked[0].groups, ['sulfate']);
  assert.equal(asked[0].core, 'malate');
  // The point of drawing it: nothing arrives.
  assert.equal(
    map.edges.filter((e) => e.to === asked[0].key).length,
    0,
    'a line arrives at a target nothing reaches',
  );
  // And it sits past everything else, so it reads as the end of the picture.
  assert.ok(asked[0].depth > Math.max(...map.nodes.filter((n) => !n.isTarget).map((n) => n.depth)));
});

test('a reachable target gets no asked-for node, because a real one is on the map', () => {
  const map = mapFor(EX, { core: 'fructose', groups: ['phosphate', 'hydroxyl', 'hydroxyl', 'hydroxyl'], match: 'exact' });
  assert.ok(map.reachable);
  assert.equal(map.nodes.filter((n) => n.isTarget).length, 0);
  assert.ok(map.nodes.some((n) => n.matches), 'nothing on the map is marked as the match');
});

test('a claim about what is not reachable cites the search depth, not the drawn width', () => {
  const map = mapFor(EX, { core: 'malate', groups: ['sulfate'], match: 'exact' });
  assert.equal(map.searchDepth, EX.maxDepth);
  // The drawn frontier is shallower than the walk, which is exactly why the
  // two must not be confused in anything the screen says.
  assert.ok(map.frontierDepth <= map.searchDepth);
});

test('a skeleton nothing reaches says so, and says it about the catalogue', () => {
  // Every core in the vocabulary is reachable by construction, so this checks
  // the branch directly with a core no rule can produce.
  const map = mapFor(EX, { core: 'not-a-real-core', groups: [], match: 'carries' });
  assert.equal(map.nodes.length, 0);
  assert.equal(map.variants, 0);
  assert.match(map.headline, /Nothing in this catalogue reaches/);
});

test('an unfinished walk is never reported as a skeleton being unreachable', () => {
  // The same honesty rule the search headline carries: a budget that ran out
  // says nothing either way.
  const starved = exploreCatalogue(entries, { maxScanNodes: 40 });
  assert.equal(starved.exhausted, false);
  const map = mapFor(starved, { core: 'malate', groups: [], match: 'carries' });
  if (map.variants === 0) {
    assert.match(map.headline, /did not finish inside its budget/);
    assert.doesNotMatch(map.headline, /Nothing in this catalogue reaches/);
  }
});

/* ------------------------------ staying readable -------------------------- */

test('the map stays within its node and line budget on every draft', () => {
  for (const draft of DRAFTS) {
    const map = mapFor(EX, draft);
    assert.ok(
      map.nodes.length <= MAP_LIMITS.maxNodes,
      `${draft.core}: ${map.nodes.length} nodes, over the budget of ${MAP_LIMITS.maxNodes}`,
    );
    assert.ok(
      map.edges.length <= MAP_LIMITS.maxEdges,
      `${draft.core}: ${map.edges.length} lines, over the budget of ${MAP_LIMITS.maxEdges}`,
    );
    // One line per pair of molecules, so the picture cannot double up.
    const pairs = new Set(map.edges.map((e) => `${e.from}>${e.to}`));
    assert.equal(pairs.size, map.edges.length, `${draft.core}: two lines drawn between the same pair`);
  }
});

test('when the map is cut short it says how many it left out', () => {
  const map = mapFor(EX, { core: 'glycerate-2-p', groups: [], match: 'carries' });
  assert.ok(map.variants > map.nodes.length, 'this fixture no longer overflows — pick a denser skeleton');
  assert.ok(map.truncated);
  assert.ok(map.deeper > 0, 'the map was cut short but reports nothing left out');
});

test('with no skeleton chosen the map is empty and says what to do', () => {
  for (const draft of [null, {}, { core: null, groups: [], match: 'carries' }]) {
    const map = mapFor(EX, draft);
    assert.equal(map.nodes.length, 0);
    assert.equal(map.edges.length, 0);
    assert.match(map.headline, /Pick a skeleton/);
  }
});

/* ------------------------------ what it may say --------------------------- */

test('no sentence the map produces overclaims', () => {
  const banned =
    /\b(viable|valid|validated|approved|safe|stable|designed|optimal|best|recommended|guaranteed|will work|in vivo|clinical|therapeutic|toxic)\b/i;
  const said = [MAP_NOTE];
  for (const draft of DRAFTS) said.push(mapFor(EX, draft).headline);
  said.push(mapFor(EX, { core: 'not-a-real-core', groups: [], match: 'carries' }).headline);
  said.push(mapFor(EX, null).headline);

  for (const line of said) {
    assert.doesNotMatch(line, banned, `the map overclaims: ${line}`);
    // No article slip: the core labels include Amide and Aspartate.
    assert.doesNotMatch(line, /\ba [aeiou]/i, `the map has an article slip: ${line}`);
  }
});

test('the note says where the picture came from', () => {
  assert.match(MAP_NOTE, /same walk the route search uses/);
  assert.match(MAP_NOTE, /one enzyme acting under its own rule/);
});

test('a highlighted chain is made only of lines already on the map, and ends at a match', () => {
  for (const draft of DRAFTS) {
    const map = mapFor(EX, draft);
    const drawn = new Set(map.edges.map((e) => e.id));
    const nodes = new Map(map.nodes.map((n) => [n.key, n]));
    const onPath = map.edges.filter((e) => e.onMatchPath);

    for (const e of onPath) {
      assert.ok(drawn.has(e.id), `${draft.core}: a highlighted line is not on the map`);
    }
    if (!map.nodes.some((n) => n.matches)) {
      assert.equal(onPath.length, 0, `${draft.core}: chains highlighted with nothing matching`);
      continue;
    }
    // Every highlighted line must lead somewhere: follow it forward and a
    // matching molecule has to be reachable over highlighted lines only.
    const forward = new Map();
    for (const e of onPath) {
      if (!forward.has(e.from)) forward.set(e.from, []);
      forward.get(e.from).push(e.to);
    }
    for (const e of onPath) {
      const stack = [e.to];
      const seen = new Set(stack);
      let lands = false;
      while (stack.length && !lands) {
        const here = stack.pop();
        if (nodes.get(here)?.matches) lands = true;
        for (const next of forward.get(here) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      assert.ok(lands, `${draft.core}: a highlighted line leads nowhere near a match`);
    }
  }
});
