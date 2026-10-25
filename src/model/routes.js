// Route search: which chains of catalogue enzymes could make a given molecule.
//
// This is a search over the committed catalogue, not a model talking. Every
// edge is one application of `runStage` from pipeline.js — the same rule the
// bench runs — so a route this file returns is a route the bench will play,
// stage for stage, and a route it does not return does not exist in the
// forty entries. Nothing here is allowed to invent a step.
//
// What it is not: this is not retrosynthesis, and the molecule model it walks
// is the symbolic core-plus-groups cartoon in molecules.js, which has no atoms,
// no valences and no energies. A route being found means only that each stage's
// cartoon rule accepts the previous stage's cartoon product. Whether the team
// could share one pot is a separate question, answered by the metrics below and
// by compatibility.js, and reported beside the route rather than folded into it.
//
// The search is deterministic: starters in their declared order, entries in
// catalogue order, breadth first, so the same target gives the same routes in
// the same order on every machine and in both languages.

import { STARTERS, starter, groupMeta, prettyCore } from './molecules.js';
import { runStage } from './pipeline.js';
import { intersectWindows, cofactorTokens, cofactorFamily } from './compatibility.js';

export const ROUTE_NOTE =
  'A route means every stage’s cartoon rule accepts the stage before it. It is not a synthesis plan, not a prediction that the chain would run, and says nothing about folding, expression, yield or safety.';

// Why these bounds exist, rather than searching exhaustively: the `add` ops can
// hang groups on forever, so the state space is infinite without a cap on how
// decorated a molecule may get. The depth cap is what keeps the answer honest —
// "no route within five stages" is a claim this search can actually support,
// where "no route" would not be.
//
// The search runs in two passes, and the split is what makes the honest answer
// possible. The first pass walks molecules, collapsing every path that arrives
// at the same molecule into one state, so it finishes well inside its budget
// and can therefore say "nothing within five stages reaches this" as a fact
// about the catalogue rather than as a fact about when the search gave up. The
// second pass walks paths, to turn a reachable target into concrete chains, and
// that one is allowed to run out — but all it is then short of is *more
// examples* of a route already proven to exist, which the UI says plainly.
export const SEARCH_LIMITS = {
  maxDepth: 5,
  maxGroups: 7,
  // Generous, because the deduplicated state space is small: a few thousand
  // molecules per starting molecule at depth five over the forty entries.
  maxScanNodes: 2000000,
  maxRoutes: 60,
  // Chains read back out of one starter's edges. A molecule reachable several
  // ways in the same number of stages can have a lot of them.
  maxRoutesPerStarter: 24,
  // At most this many orderings of the same set of enzymes. Six permutations of
  // one trio are not six different answers to "what could make this", and
  // without this cap they crowd out the genuinely different combinations.
  routesPerSet: 2,
  nearMisses: 6,
};

/* ---------------- the target, and the vocabulary it may use ---------------- */

// Cores a route could ever end on: the starters, plus anything a `rearrange`
// rule can turn one into. Derived from the catalogue so it cannot drift from it.
export function reachableCores(entries) {
  const cores = new Set(STARTERS.map((s) => s.core));
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of entries) {
      if (e.action.op === 'rearrange' && cores.has(e.action.from) && !cores.has(e.action.to)) {
        cores.add(e.action.to);
        grew = true;
      }
    }
  }
  return [...cores];
}

// Groups a route could ever put on a molecule: whatever the starters carry,
// plus whatever an `add`, `remove` or `join` rule hands back.
export function reachableGroups(entries) {
  const groups = new Set();
  for (const s of STARTERS) for (const g of s.groups) groups.add(g);
  for (const e of entries) {
    const a = e.action;
    if (a.op === 'add' || a.op === 'join') groups.add(a.group);
    if (a.op === 'remove' && a.yields) groups.add(a.yields);
  }
  return [...groups];
}

// The whole vocabulary a target may be written in. The conversational picker
// offers nothing outside this, and `parseTarget` refuses anything outside it,
// which is what keeps a parsed sentence from naming a molecule the search
// could never reach or a group the catalogue has never heard of.
export function targetVocabulary(entries) {
  return {
    cores: reachableCores(entries),
    groups: reachableGroups(entries),
    starters: STARTERS.map((s) => ({ id: s.id, core: s.core, label: s.label, groups: [...s.groups] })),
    matches: ['exact', 'carries'],
  };
}

// A target is a core skeleton plus a multiset of groups, and how strictly to
// read it: `exact` means that core carrying exactly those groups, `carries`
// means that core carrying at least those groups.
export function makeTarget({ core, groups = [], match = 'exact', label = null }) {
  return { core, groups: [...groups].sort(), match, label };
}

// Check a target against the catalogue's own vocabulary and say what is wrong
// rather than failing quietly. Used on anything the model produced.
export function validateTarget(entries, target) {
  const vocab = targetVocabulary(entries);
  const problems = [];
  if (!target || typeof target.core !== 'string' || !target.core) {
    problems.push('No skeleton was named.');
  } else if (!vocab.cores.includes(target.core)) {
    problems.push(`Nothing in this catalogue can reach a ${prettyCore(target.core)} skeleton. Reachable skeletons: ${vocab.cores.map(prettyCore).join(', ')}.`);
  }
  const groups = Array.isArray(target?.groups) ? target.groups : [];
  for (const g of groups) {
    if (!vocab.groups.includes(g)) problems.push(`This catalogue has no rule that puts a "${g}" anywhere.`);
  }
  if (target && target.match && !vocab.matches.includes(target.match)) {
    problems.push(`Unknown match mode "${target.match}".`);
  }
  if (groups.length > SEARCH_LIMITS.maxGroups) {
    problems.push(`Asking for ${groups.length} groups is past the search's cap of ${SEARCH_LIMITS.maxGroups}.`);
  }
  return { ok: problems.length === 0, problems };
}

// "a" or "an", so a parsed sentence does not come back out as "a amine".
function article(word) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

export function describeTarget(target) {
  const parts = countGroups(target.groups).map(([g, n]) => {
    const label = groupMeta(g).label;
    return n > 1 ? `${n}× ${label}` : `${article(label)} ${label}`;
  });
  const body = parts.length ? `${prettyCore(target.core)} carrying ${parts.join(', ')}` : `${prettyCore(target.core)} carrying nothing else`;
  return target.match === 'carries' ? `${body} (and possibly more)` : body;
}

function countGroups(groups) {
  const counts = new Map();
  for (const g of groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/* ------------------------------ the search ------------------------------- */

export function moleculeKey(mol) {
  return `${mol.core}|${[...mol.groups].sort().join(',')}`;
}

// Multiset difference: what is in `want` that `have` does not cover.
function missing(want, have) {
  const pool = [...have];
  const out = [];
  for (const g of want) {
    const i = pool.indexOf(g);
    if (i === -1) out.push(g);
    else pool.splice(i, 1);
  }
  return out;
}

export function matchesTarget(mol, target) {
  if (mol.core !== target.core) return false;
  if (missing(target.groups, mol.groups).length) return false;
  if (target.match === 'carries') return true;
  return missing(mol.groups, target.groups).length === 0;
}

// How far a molecule is from the target. A wrong skeleton dominates, because no
// number of group edits fixes it — only a rearrange rule can, and there may not
// be one. Used only to report how close the search got when it found nothing.
export function targetDistance(mol, target) {
  const coreOff = mol.core === target.core ? 0 : 1;
  const short = missing(target.groups, mol.groups);
  const over = target.match === 'carries' ? [] : missing(mol.groups, target.groups);
  return { coreOff, missing: short, extra: over, total: coreOff * 100 + short.length + over.length };
}

/* ------------------------------ the search ------------------------------- */
//
// The search runs once per starting molecule, and the reason is the honest
// answer it produces. A single walk that pooled every starter would collapse a
// molecule reached from two different starting points into one state and throw
// one of the two starting points away; run per starter, the result is "the
// shortest chain from each starting molecule that can get there", which is a
// claim with no asterisk on it, and which gives routes of genuinely different
// lengths for "fewest stages" to be fewer than.
//
// Within one starter it is a breadth-first walk over molecules rather than over
// paths, so every chain arriving at the same molecule collapses into one state
// and the walk finishes well inside its budget. That is what lets the app say
// "nothing the forty entries can do reaches this within five stages" as a fact
// about the catalogue rather than as a fact about when the search gave up.
// Concrete chains are then read back out of the recorded edges, so every route
// listed is one the walk actually traversed.

// One starter's walk. Records, for each molecule, the fewest stages that reach
// it and every edge that reaches it in exactly that many, which is the graph
// the routes are read back out of.
export function scanFromStarter(entries, target, starterId, limits = SEARCH_LIMITS) {
  const depthOf = new Map();
  const parents = new Map();
  const molOf = new Map();

  const first = starter(starterId);
  const firstKey = moleculeKey(first);
  depthOf.set(firstKey, 0);
  molOf.set(firstKey, first);

  const targetKeys = [];
  let shortestDepth = null;
  let nodes = 0;
  let exhausted = true;

  if (matchesTarget(first, target)) {
    targetKeys.push(firstKey);
    shortestDepth = 0;
  }

  let frontier = shortestDepth === null ? [firstKey] : [];

  for (let depth = 0; depth < limits.maxDepth && frontier.length; depth += 1) {
    const next = [];
    for (const parentKey of frontier) {
      const parentMol = molOf.get(parentKey);
      for (const entry of entries) {
        if (nodes >= limits.maxScanNodes) {
          exhausted = false;
          break;
        }
        nodes += 1;
        const r = runStage(parentMol, entry);
        if (!r.ok) continue;
        if (r.product.groups.length > limits.maxGroups) continue;

        const childKey = moleculeKey(r.product);
        const known = depthOf.get(childKey);
        const edge = { fromKey: parentKey, enzymeId: entry.id, what: r.what };

        if (known === undefined) {
          depthOf.set(childKey, depth + 1);
          molOf.set(childKey, r.product);
          parents.set(childKey, [edge]);
          next.push(childKey);
          if (matchesTarget(r.product, target)) targetKeys.push(childKey);
        } else if (known === depth + 1) {
          // Another way to the same molecule in the same number of stages: a
          // genuinely different route, so the edge is kept rather than dropped.
          parents.get(childKey).push(edge);
        }
      }
      if (!exhausted) break;
    }
    frontier = next;
    // Stop once a layer has produced the target. The layer was walked to its
    // end first, so every shortest-route edge into it has been recorded.
    if (targetKeys.length) {
      shortestDepth = depth + 1;
      break;
    }
  }

  return { starterId, depthOf, parents, molOf, targetKeys, shortestDepth, nodes, exhausted, statesSeen: depthOf.size };
}

// Read concrete chains back out of one starter's recorded edges, walking
// backwards from each molecule that matched. Entries are tried in catalogue
// order on the way in, so the chains come back in a fixed order.
export function pathsFromScan(scan, target, cap) {
  const out = [];

  const walk = (key, stages, molecules, whats) => {
    if (out.length >= cap) return;
    const edges = scan.parents.get(key);
    const mol = scan.molOf.get(key);
    if (!edges || !edges.length) {
      out.push({
        starterId: scan.starterId,
        stages,
        molecules: [mol, ...molecules],
        whats,
      });
      return;
    }
    for (const e of edges) {
      walk(e.fromKey, [e.enzymeId, ...stages], [mol, ...molecules], [e.what, ...whats]);
      if (out.length >= cap) return;
    }
  };

  for (const key of scan.targetKeys) {
    walk(key, [], [], []);
    if (out.length >= cap) break;
  }
  return out;
}

// The call the app makes.
export function searchRoutes(entries, target, opts = {}) {
  const limits = { ...SEARCH_LIMITS, ...opts };
  const starterIds = limits.starterIds ?? STARTERS.map((s) => s.id);

  const routes = [];
  const perSet = new Map();
  const near = [];
  const reachedFrom = [];
  let totalFound = 0;
  let nodes = 0;
  let statesSeen = 0;
  let exhausted = true;
  let truncated = false;

  for (const starterId of starterIds) {
    const scan = scanFromStarter(entries, target, starterId, limits);
    nodes += scan.nodes;
    statesSeen += scan.statesSeen;
    if (!scan.exhausted) exhausted = false;

    if (scan.shortestDepth === null) {
      // Nothing from this starter. Keep how close it came, for the dead-end
      // report, reading every molecule this starter can reach.
      for (const [key, mol] of scan.molOf) {
        considerNear(near, { mol, starterId, stages: [], depth: scan.depthOf.get(key) }, target, limits.nearMisses);
      }
      continue;
    }

    reachedFrom.push({ starterId, stages: scan.shortestDepth });
    const found = pathsFromScan(scan, target, limits.maxRoutesPerStarter);
    totalFound += found.length;
    if (found.length >= limits.maxRoutesPerStarter) truncated = true;

    for (const path of found) {
      // Several orderings of the same enzymes are not several answers to "what
      // could make this", so only a couple of each set get through.
      const setKey = [path.starterId, ...[...path.stages].sort()].join('+');
      const used = perSet.get(setKey) ?? 0;
      if (used >= limits.routesPerSet) continue;
      if (routes.length >= limits.maxRoutes) {
        truncated = true;
        break;
      }
      perSet.set(setKey, used + 1);
      routes.push(toRoute(path, target));
    }
  }

  const depths = reachedFrom.map((r) => r.stages);

  return {
    target,
    routes,
    totalFound,
    truncated,
    reachable: reachedFrom.length > 0,
    reachedFrom,
    shortestDepth: depths.length ? Math.min(...depths) : null,
    longestShortest: depths.length ? Math.max(...depths) : null,
    scan: { exhausted, statesSeen, nodesExplored: nodes },
    nodesExplored: nodes,
    limits: { maxDepth: limits.maxDepth, maxGroups: limits.maxGroups },
    nearMisses: near.map((n) => ({
      starterId: n.starterId,
      stages: [],
      depth: n.depth ?? null,
      molecule: { core: n.mol.core, groups: [...n.mol.groups] },
      distance: targetDistance(n.mol, target),
    })),
    note: ROUTE_NOTE,
  };
}

// Keep the few closest states the scan ever stood in. Strictly better replaces;
// a tie keeps whichever was reached first, which breadth-first order makes the
// shorter one.
function considerNear(near, node, target, cap) {
  const d = targetDistance(node.mol, target).total;
  if (d === 0) return;
  if (near.length < cap) {
    near.push(node);
    near.sort((a, b) => cmpNear(a, b, target));
    return;
  }
  const worst = near[near.length - 1];
  if (d < targetDistance(worst.mol, target).total) {
    near[near.length - 1] = node;
    near.sort((a, b) => cmpNear(a, b, target));
  }
}

function cmpNear(a, b, target) {
  const da = targetDistance(a.mol, target).total;
  const db = targetDistance(b.mol, target).total;
  if (da !== db) return da - db;
  return a.stages.length - b.stages.length;
}

function toRoute(path, target) {
  return {
    id: `${path.starterId}>${path.stages.join('>')}`,
    starterId: path.starterId,
    stages: [...path.stages],
    // The molecule before the first stage, then after every stage. The bench
    // reproduces these exactly, because both come from the same runStage call.
    molecules: path.molecules.map((m) => ({ core: m.core, groups: [...m.groups] })),
    steps: [...(path.whats ?? [])],
    depth: path.stages.length,
    target,
  };
}

/* ------------------------------- the metrics ------------------------------ */
//
// Everything a route is ranked or chosen by is computed here, in code, from
// committed catalogue fields. The model is never asked for one of these
// numbers; it is only allowed to read them out and say which route they favour.

export function routeMetrics(entries, route) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const stageEntries = route.stages.map((id) => byId.get(id)).filter(Boolean);

  const temp = intersectWindows(stageEntries, 'temp');
  const ph = intersectWindows(stageEntries, 'ph');

  const cofactors = new Set();
  const needs = new Set();
  for (const e of stageEntries) {
    for (const t of cofactorTokens(e.cofactor)) cofactors.add(cofactorFamily(t));
    for (const n of e.needs ?? []) needs.add(n);
  }

  return {
    routeId: route.id,
    stages: stageEntries.length,
    // What the pot has to supply beyond the enzymes themselves: distinct
    // cofactor pools, plus the host machinery the catalogue says a stage needs.
    supplyLoad: cofactors.size + needs.size,
    cofactors: [...cofactors].sort(),
    needs: [...needs].sort(),
    tempWindow: temp.empty ? null : { low: temp.low, high: temp.high, width: temp.width },
    tempEmpty: Boolean(temp.empty),
    tempBlame: temp.blame ? { floor: temp.blame.floor.id, ceiling: temp.blame.ceiling.id } : null,
    phWindow: ph.empty ? null : { low: ph.low, high: ph.high, width: ph.width },
    phEmpty: Boolean(ph.empty),
    phBlame: ph.blame ? { floor: ph.blame.floor.id, ceiling: ph.blame.ceiling.id } : null,
  };
}

// The things a user is allowed to optimise for. Each is a committed field or an
// arithmetic combination of them — there is no "best route" here, only "fewest
// of this" and "widest of that", and the criterion is named on screen beside
// the ordering so a reader can see what was sorted.
export const CRITERIA = [
  {
    id: 'stages',
    label: 'Fewest stages',
    blurb: 'The shortest chain. Fewer stages means fewer chances for a stage to refuse the molecule.',
  },
  {
    id: 'supply',
    label: 'Lowest supply load',
    blurb: 'The fewest distinct cofactor pools and host requirements the pot has to provide.',
  },
  {
    id: 'temp',
    label: 'Widest shared temperature',
    blurb: 'The widest band of temperature every stage’s stated window covers at once. A route with no shared band at all sorts last.',
  },
  {
    id: 'ph',
    label: 'Widest shared pH',
    blurb: 'The widest band of pH every stage’s stated window covers at once. A route with no shared band at all sorts last.',
  },
];

export function criterion(id) {
  return CRITERIA.find((c) => c.id === id) ?? CRITERIA[0];
}

// Deterministic total order: the criterion first, then stage count, then the
// route id, so two routes can never swap places between runs or languages.
export function rankRoutes(entries, routes, criterionId = 'stages') {
  const scored = routes.map((route) => ({ route, metrics: routeMetrics(entries, route) }));
  const key = (m) => {
    if (criterionId === 'supply') return m.supplyLoad;
    if (criterionId === 'temp') return m.tempEmpty ? Infinity : -m.tempWindow.width;
    if (criterionId === 'ph') return m.phEmpty ? Infinity : -m.phWindow.width;
    return m.stages;
  };
  return scored.sort((a, b) => {
    const ka = key(a.metrics);
    const kb = key(b.metrics);
    if (ka !== kb) return ka < kb ? -1 : 1;
    if (a.metrics.stages !== b.metrics.stages) return a.metrics.stages - b.metrics.stages;
    return a.route.id < b.route.id ? -1 : a.route.id > b.route.id ? 1 : 0;
  });
}

// One honest sentence about what the search found, with no adjective that the
// numbers do not support. Used as the headline above the grid, and handed to
// the model as the only summary it is allowed to paraphrase.
// One honest sentence about what the search found. Every number in it is
// something the search can stand behind: a dead end only reads as a dead end
// when the scan actually finished, and a route count says how deep the
// enumeration went rather than implying the list is all there is.
export function searchHeadline(result) {
  const t = describeTarget(result.target);

  if (!result.reachable) {
    const best = result.nearMisses[0];
    // The scan ran out of room, so the only honest report is that the search
    // did not finish. Saying "no route" here would be a claim about the search
    // dressed up as a claim about the catalogue.
    if (!result.scan.exhausted) {
      return `The search did not finish inside its budget, so this says nothing either way about whether ${t} can be made. It walked ${result.scan.statesSeen.toLocaleString('en')} molecules without reaching it.`;
    }
    if (!best) {
      return `No chain of up to ${result.limits.maxDepth} catalogue stages makes ${t}, and the search has nothing to report about how close it got.`;
    }
    const d = best.distance;
    const bits = [];
    if (d.coreOff) bits.push(`never reached a ${prettyCore(result.target.core)} skeleton at all`);
    if (d.missing.length) bits.push(`still short of ${d.missing.map((g) => groupMeta(g).label).join(', ')}`);
    if (d.extra.length) bits.push(`still carrying ${d.extra.map((g) => groupMeta(g).label).join(', ')} that would have to come off`);
    const where = prettyCore(best.molecule.core);
    const howFar = best.depth ? `${best.depth} stage${best.depth === 1 ? '' : 's'} in, at ${where}` : `${where} itself, before any stage ran`;
    return `No chain of up to ${result.limits.maxDepth} catalogue stages makes ${t}. The search walked every one of the ${result.scan.statesSeen.toLocaleString('en')} molecules the forty entries can reach; the closest it came was ${howFar}, ${bits.join(' and ')}.`;
  }

  const shown = result.routes.length;
  const found = result.totalFound;
  const starters = result.reachedFrom.length;
  const lo = result.shortestDepth;
  const hi = result.longestShortest;

  const span = lo === hi ? `${lo} stage${lo === 1 ? '' : 's'}` : `${lo} to ${hi} stages`;
  const head = `${starters} of the ${STARTERS.length} starting molecules can reach ${t}, in ${span}.`;
  const tail =
    shown === found
      ? found === 1
        ? 'It is the only chain the search found.'
        : `All ${found} chains the search found are shown.`
      : `${shown} of the ${found} chains it found are shown, picked to be different combinations of enzymes rather than reorderings of the same one.`;
  return `${head} ${tail}`;
}
