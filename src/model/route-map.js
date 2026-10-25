// What this catalogue can reach, while you are still deciding what you want.
//
// The picker asks for a skeleton and some groups. This module answers a
// different question from the route search, and the difference is the point:
//
//   * the route search asks "how do I get to THIS molecule", and answers with
//     chains, or with an honest dead end;
//   * the map asks "what is even possible on this skeleton", and answers with
//     every molecule of it the forty entries can reach, and the single stages
//     that connect them.
//
// Both answers come out of the same walk. `scanFromStarter` in routes.js
// records, for every molecule it reaches, the fewest stages that reach it and
// every edge that reaches it in exactly that many. The search reads chains out
// of those edges; the map reads the edges themselves. There is no second
// search here, and that matters: a line on the map cannot claim a stage the
// search would not also find, because it IS one of the search's own edges.
//
// The one thing the map needs that a route search does not is for the walk to
// run to its full depth rather than stopping at the first layer that produces
// the target — hence `stopAtTarget: false`. "Glucose carrying at least
// nothing" is matched by glucose itself, so a search for it stops at once and
// would draw a map of one node.
//
// What the map will not do. It will not show a molecule as reachable that the
// walk did not reach, it will not hide a target because nothing reaches it
// (that case is the most interesting thing it can say), and it draws no edge
// that is not an enzyme in the catalogue acting under its own rule. There is
// no layout cleverness that invents a relationship: an edge exists only where
// a rule turns one drawn molecule into another.

import {
  scanFromStarter,
  makeTarget,
  moleculeKey,
  matchesTarget,
  coreLabel,
  SEARCH_LIMITS,
} from './routes.js';
import { STARTERS } from './molecules.js';
import { article } from './behaviours.js';

export const MAP_NOTE =
  'Every node is a molecule this catalogue can actually reach, and every line is one enzyme acting under its own rule. Both come out of the same walk the route search uses, so nothing is drawn here that the search would not also find.';

export const MAP_LIMITS = {
  // The map grows a layer at a time and stops before the layer that would push
  // it past this. Chosen to stay readable on a projector rather than to be
  // complete — `deeper` says how many were left out, and the search still
  // finds them.
  maxNodes: 30,
  // Never draw more than this many stages out, even if they would fit. Past
  // about four columns the picture stops reading as a map.
  maxDepth: 4,
  // Matching molecules are drawn even when they sit past the frontier, because
  // they are the ones being chosen. This caps how many.
  maxMatches: 8,
  // Lines between two drawn molecules, to stop a dense layer from becoming a
  // solid block of ink.
  maxEdges: 70,
  // Molecules drawn in any one column. Without this a single stage can be
  // fifteen deep, which makes a picture that is taller than the screen and
  // reads as a list rather than a map. Matching molecules keep their places
  // first, so narrowing never pushes the answer out of the column.
  maxPerColumn: 8,
  // However tight the columns get, draw at least this many of the molecules
  // that match, so the map never goes blank at the moment the reader finally
  // says what they want. A column carrying pinned matches may exceed
  // maxPerColumn by up to this much, and that is the intended trade.
  minMatchesDrawn: 3,
};

// A target no molecule can match, so the walk runs to its full depth. The core
// is deliberately not a name any catalogue entry could produce.
const NO_TARGET = makeTarget({ core: '\u0000 no target', groups: [], match: 'exact' });

/* ------------------------------ the exploration --------------------------- */

// One full walk per starting molecule, to maxDepth. This is the expensive call
// (a few hundred milliseconds over the whole catalogue) and it does not depend
// on what the user has typed, so a caller should run it once and keep it.
export function exploreCatalogue(entries, limits = {}) {
  const lim = { ...SEARCH_LIMITS, ...limits, stopAtTarget: false };
  const scans = STARTERS.map((s) => scanFromStarter(entries, NO_TARGET, s.id, lim));

  // Pool the scans into one picture of what is reachable, keeping for each
  // molecule the shallowest way to it and which starting molecules get there.
  const reach = new Map();
  for (const scan of scans) {
    for (const [key, mol] of scan.molOf) {
      const depth = scan.depthOf.get(key);
      const found = reach.get(key);
      if (!found) {
        reach.set(key, { key, mol, depth, from: [scan.starterId] });
      } else {
        if (!found.from.includes(scan.starterId)) found.from.push(scan.starterId);
        if (depth < found.depth) found.depth = depth;
      }
    }
  }

  return {
    scans,
    reach,
    exhausted: scans.every((s) => s.exhausted),
    statesSeen: scans.reduce((n, s) => n + s.statesSeen, 0),
    maxDepth: lim.maxDepth,
  };
}

/* -------------------------------- the map --------------------------------- */

// Multiset containment: does `have` cover everything in `want`?
function covers(have, want) {
  const pool = [...have];
  for (const g of want) {
    const i = pool.indexOf(g);
    if (i === -1) return false;
    pool.splice(i, 1);
  }
  return true;
}

// The draft the picker is holding. `core` may be set with no groups yet, which
// is the case this whole module exists for.
export function mapFor(exploration, draft, limits = {}) {
  const lim = { ...MAP_LIMITS, ...limits };
  const core = draft?.core ?? null;
  const groups = draft?.groups ?? [];
  const match = draft?.match ?? 'carries';

  if (!core) {
    return {
      core: null,
      nodes: [],
      edges: [],
      matches: [],
      frontierDepth: 0,
      deeper: 0,
      variants: 0,
      truncated: false,
      reachable: false,
      note: MAP_NOTE,
      headline: 'Pick a skeleton and this fills in with what the catalogue can do to it.',
    };
  }

  // Every reachable molecule on this skeleton, shallowest first. This is the
  // set the user is choosing from, whether they know it yet or not.
  const variants = [...exploration.reach.values()]
    .filter((v) => v.mol.core === core)
    .sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key));

  // Which of them match what has been said so far. A draft with no groups
  // matches every variant, which is correct: nothing has been ruled out yet.
  // With no groups named and a loose match, every variant matches. Marking or
  // pinning them all would be an emphasis that says nothing, so the map waits
  // until the draft has actually ruled something out.
  const narrowing = groups.length > 0 || match === 'exact';
  const target = makeTarget({ core, groups, match });
  const matching = variants.filter((v) =>
    groups.length === 0 && match === 'carries' ? true : matchesTarget(v.mol, target),
  );

  // Grow the frontier a layer at a time and stop BEFORE the layer that would
  // overflow, so the picture is always a complete picture of everything within
  // some number of stages rather than an arbitrary slice of a deeper one.
  const byDepth = new Map();
  for (const v of exploration.reach.values()) {
    if (!byDepth.has(v.depth)) byDepth.set(v.depth, []);
    byDepth.get(v.depth).push(v);
  }

  // Only the starting molecules that can actually get to this skeleton. Drawing
  // all eighteen would put a node on the map for a starter that never reaches
  // the thing being asked about, which reads as a possibility and is not one.
  const useful = new Set();
  for (const v of variants) for (const id of v.from) useful.add(id);
  const relevant = (v) => (v.mol.core === core ? true : v.depth === 0 && v.from.some((id) => useful.has(id)));

  // The node budget is a hard ceiling, not a target: the pinned matches below
  // and the chains back to them are counted against it too, so the picture
  // cannot quietly grow past what fits on a projector.
  const shown = new Map();
  let frontierDepth = -1;
  let dropped = 0;
  const room = Math.max(4, lim.maxNodes - lim.maxMatches);
  const matchKeysEarly = new Set(matching.map((v) => v.key));
  for (let d = 0; d <= Math.min(lim.maxDepth, exploration.maxDepth); d += 1) {
    const all = (byDepth.get(d) ?? []).filter(relevant);
    // Matching molecules first, so a column that has to be cut keeps the ones
    // the reader asked about rather than whichever the walk reached first.
    const layer = [...all].sort(
      (a, b) => Number(matchKeysEarly.has(b.key)) - Number(matchKeysEarly.has(a.key)) || a.key.localeCompare(b.key),
    );
    const take = layer.slice(0, lim.maxPerColumn);
    if (shown.size + take.length > room && shown.size > 0) break;
    for (const v of take) {
      if (shown.size >= room) break;
      shown.set(v.key, v);
    }
    dropped += layer.length - take.length;
    frontierDepth = d;
    if (shown.size >= room) break;
  }

  // The matching molecules are what is being chosen, so they are drawn even
  // when they sit past the frontier, together with the shortest chain back to
  // a starting molecule. Without this the map would go blank exactly when the
  // user finished saying something specific, which is the worst moment for it
  // to stop helping.
  // Only once the draft narrows. With nothing named every variant "matches",
  // and pinning eight of them would pad the picture with molecules the reader
  // never asked about.
  //
  // And only as far as it takes to keep the map from going blank. The frontier
  // already draws matching molecules first, so it usually carries some on its
  // own; pinning exists for the case where every match sits past the frontier,
  // which is exactly when the reader has got specific. Stopping as soon as a
  // few are drawn keeps that guarantee without letting one column grow back
  // into the tall list the column cap exists to prevent.
  const pinned = [];
  const enough = Math.min(lim.minMatchesDrawn, matching.length);
  const drawnMatches = () => [...shown.keys()].filter((k) => matchKeysEarly.has(k)).length;
  for (const v of narrowing ? matching : []) {
    if (drawnMatches() >= enough) break;
    if (shown.has(v.key)) continue;
    if (pinned.length >= lim.maxMatches) break;
    const chain = chainBack(exploration, v.key);
    if (shown.size + chain.filter((n) => !shown.has(n.key)).length > lim.maxNodes) break;
    for (const node of chain) shown.set(node.key, node);
    pinned.push(v);
  }

  // Edges: only between two drawn molecules, and only the recorded
  // shortest-path edges, which are the search's own.
  //
  // One line per pair of molecules, carrying every enzyme that makes that same
  // change. Several entries in this catalogue do the same thing to the same
  // molecule, and drawing each as its own line turns a readable map into a
  // thicket without adding a fact: that two enzymes both do it is something to
  // say on the line, not a second connection.
  const byPair = new Map();
  for (const scan of exploration.scans) {
    for (const [key, list] of scan.parents) {
      if (!shown.has(key)) continue;
      for (const e of list) {
        if (!shown.has(e.fromKey)) continue;
        const pair = `${e.fromKey}>${key}`;
        let edge = byPair.get(pair);
        if (!edge) {
          if (byPair.size >= lim.maxEdges) continue;
          edge = { id: pair, from: e.fromKey, to: key, enzymeIds: [], what: e.what };
          byPair.set(pair, edge);
        }
        if (!edge.enzymeIds.includes(e.enzymeId)) edge.enzymeIds.push(e.enzymeId);
      }
    }
  }

  const matchKeys = new Set(narrowing ? matching.map((v) => v.key) : []);
  // Trace the drawn chains that end at a matching molecule, so the reader can
  // follow a whole route back to a starting molecule rather than seeing only
  // the last step into the answer. Walked backwards over the drawn edges, so a
  // highlighted line is always one of the lines already on the map.
  const intoMatch = new Set();
  {
    const incoming = new Map();
    for (const e of byPair.values()) {
      if (!incoming.has(e.to)) incoming.set(e.to, []);
      incoming.get(e.to).push(e);
    }
    const queue = [...shown.keys()].filter((k) => matchKeys.has(k));
    const seen = new Set(queue);
    while (queue.length) {
      const here = queue.pop();
      for (const e of incoming.get(here) ?? []) {
        intoMatch.add(e.id);
        if (!seen.has(e.from)) {
          seen.add(e.from);
          queue.push(e.from);
        }
      }
    }
  }
  for (const e of byPair.values()) e.onMatchPath = intoMatch.has(e.id);

  const edges = [...byPair.values()].sort((a, b) => a.id.localeCompare(b.id));

  const nodes = [...shown.values()]
    .sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key))
    .map((v) => ({
      key: v.key,
      core: v.mol.core,
      groups: [...v.mol.groups],
      depth: v.depth,
      from: [...v.from],
      onSkeleton: v.mol.core === core,
      matches: matchKeys.has(v.key),
      isStarter: v.depth === 0,
    }));

  const deeper = variants.filter((v) => !shown.has(v.key)).length;

  // When nothing reaches what was asked for, the thing asked for is still put
  // on the map — in a column of its own, with no line arriving at it. The
  // headline says so in words, but a reader looking at a graph believes the
  // graph, so the graph has to show the gap rather than leave the subject out
  // and look complete. It is marked unreachable so the view can draw it as
  // asked-for rather than as reached.
  if (core && variants.length && !matching.length) {
    nodes.push({
      key: `\u0000asked|${moleculeKey({ core, groups })}`,
      core,
      groups: [...groups],
      depth: Math.max(0, frontierDepth) + 1,
      from: [],
      onSkeleton: true,
      matches: false,
      isStarter: false,
      isTarget: true,
      unreachable: true,
    });
  }

  return {
    core,
    nodes,
    edges,
    matches: matching.slice(0, lim.maxMatches).map((v) => v.key),
    matchCount: matching.length,
    frontierDepth: Math.max(0, frontierDepth),
    // How far the walk behind this map actually went. The drawn frontier is
    // usually shallower, so a claim about what is NOT reachable has to cite
    // this one — citing the frontier would understate the search and turn a
    // fact about the catalogue into a fact about the picture's width.
    searchDepth: exploration.maxDepth,
    deeper,
    variants: variants.length,
    truncated: deeper > 0 || edges.length >= lim.maxEdges,
    reachable: matching.length > 0,
    exhausted: exploration.exhausted,
    note: MAP_NOTE,
    headline: headlineFor(core, variants, matching, groups, match, exploration),
  };
}

// Walk back from one molecule along the recorded shortest-path edges, taking
// one parent at each step, which gives one concrete chain rather than the
// whole cone. One chain is what makes the node readable; the search is where
// you go for all of them.
function chainBack(exploration, key) {
  const out = [];
  const seen = new Set();
  let here = key;
  for (let guard = 0; guard < 24; guard += 1) {
    const node = exploration.reach.get(here);
    if (!node || seen.has(here)) break;
    seen.add(here);
    out.push(node);
    let step = null;
    for (const scan of exploration.scans) {
      const list = scan.parents.get(here);
      if (list && list.length) {
        step = list[0];
        break;
      }
    }
    if (!step) break;
    here = step.fromKey;
  }
  return out;
}

/* ------------------------------ what it says ------------------------------ */

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function headlineFor(core, variants, matching, groups, match, exploration) {
  const label = coreLabel(core);
  const skeleton = `${article(label)} skeleton`;

  if (!variants.length) {
    // The skeleton itself is out of reach. Said plainly, because it is the
    // answer rather than an empty state. And an unfinished walk is reported as
    // unfinished, the same rule the search headline follows.
    return exploration.exhausted
      ? `Nothing in this catalogue reaches ${skeleton} at all, within ${exploration.maxDepth} stages.`
      : `The walk did not finish inside its budget, so this says nothing either way about whether ${skeleton} can be reached.`;
  }

  if (groups.length === 0 && match === 'carries') {
    return variants.length === 1
      ? `One molecule on ${skeleton} is reachable here, and that is the only one. Add a group to say whether you want it.`
      : `${variants.length} different molecules on ${skeleton} are reachable here. Add a group and this narrows to the ones carrying it.`;
  }

  if (!matching.length) {
    return variants.length === 1
      ? `Only one molecule on ${skeleton} is reachable at all, and it does not carry that. The target is drawn below with nothing arriving at it.`
      : `Of the ${variants.length} molecules on ${skeleton} this catalogue can reach, none carries that. The target is drawn below with nothing arriving at it.`;
  }

  const shallowest = matching[0].depth;
  const near =
    shallowest === 0
      ? 'and one of them needs no stages at all'
      : `the nearest ${shallowest === 1 ? 'one stage' : `${shallowest} stages`} away`;
  return matching.length === variants.length
    ? `All ${variants.length} reachable ${label} molecules match what you have said, ${near}.`
    : `${matching.length} of the ${variants.length} reachable ${label} molecules ${plural(matching.length, 'matches', 'match')} what you have said, ${near}.`;
}
